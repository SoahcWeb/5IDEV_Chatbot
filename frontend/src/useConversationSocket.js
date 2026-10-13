import { useEffect, useRef, useState } from 'react'

const TERMINAL_CODES = new Set([4401, 4403, 4404])
const INITIAL_BACKOFF = 1000
const MAX_BACKOFF = 15000

function buildUrl(baseUrl, conversationId, token) {
  const base = baseUrl || 'ws://localhost:8000'
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${cleanBase}/ws/conversations/${conversationId}/?token=${token}`
}

export function useConversationSocket({
  conversationId,
  token,
  baseUrl,
  onRead,
  onReconnect,
} = {}) {
  const [status, setStatus] = useState('idle')
  const [messages, setMessages] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)

  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const retryRef = useRef(0)
  const onReadRef = useRef(onRead)
  const onReconnectRef = useRef(onReconnect)
  const wasOpenRef = useRef(false)

  onReadRef.current = onRead
  onReconnectRef.current = onReconnect

  useEffect(() => {
    if (!conversationId || !token) {
      setStatus('idle')
      return undefined
    }

    let active = true

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const connect = () => {
      if (!active) return
      setStatus('connecting')

      const url = buildUrl(baseUrl, conversationId, token)
      const ws = new WebSocket(url)
      socketRef.current = ws

      ws.onopen = () => {
        if (!active) return
        setStatus('open')
        setError(null)
        retryRef.current = 0
        if (wasOpenRef.current) onReconnectRef.current?.()
        wasOpenRef.current = true
      }

      ws.onmessage = (e) => {
        if (!active) return
        let data
        try {
          data = JSON.parse(e.data)
        } catch {
          return
        }

        if (data.type === 'message.created' && data.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.message.id)) return prev
            return [...prev, data.message]
          })
        } else if (data.type === 'message.deleted') {
          setEvents((prev) => [
            ...prev,
            {
              type: 'deleted',
              messageId: data.message_id,
              conversation: data.conversation,
            },
          ])
        } else if (data.type === 'message.updated' && data.message) {
          setEvents((prev) => [
            ...prev,
            { type: 'updated', message: data.message },
          ])
        } else if (data.type === 'conversation.read') {
          onReadRef.current?.({
            conversation: data.conversation,
            unread_count: 0,
          })
        } else if (data.type === 'error') {
          setError(data)
        }
      }

      ws.onclose = (event) => {
        socketRef.current = null
        if (!active) return

        // ⚠️ 1. Codes terminaux → pas de reconnexion
        if (TERMINAL_CODES.has(event.code)) {
          setStatus('closed')
          setError({
            code: 'terminal_close',
            codeNumber: event.code,
            message: event.reason || 'Conversation inaccessible',
          })
          clearReconnectTimer()
          return
        }

        setStatus('closed')

        // ⚠️ 2. Code 1006 (fermeture anormale) → error.code = "socket_error"
        if (event.code === 1006) {
          setError({
            code: 'socket_error',
            message: 'Socket closed unexpectedly.',
          })
        } else {
          setError({
            code: 'socket_closed',
            codeNumber: event.code,
            message: event.reason || 'Connection closed',
          })
        }

        // ⚠️ 3. Reconnexion avec backoff, timer stocké
        const delay = Math.min(
          INITIAL_BACKOFF * 2 ** retryRef.current,
          MAX_BACKOFF,
        )
        retryRef.current += 1
        clearReconnectTimer()
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          connect()
        }, delay)
      }

      ws.onerror = () => {
        if (!active) return
        setError({ code: 'socket_error', message: 'WebSocket error' })
      }
    }

    connect()

    // ⚠️ 4. Cleanup : clear le timer + ferme le socket
    return () => {
      active = false
      clearReconnectTimer()
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
      wasOpenRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, token, baseUrl])

  const sendMessage = (content) => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: 'message.send', content }))
    return true
  }

  const markConversationRead = () => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify({ type: 'conversation.read' }))
    return true
  }

  return {
    status,
    messages,
    events,
    error,
    sendMessage,
    markConversationRead,
  }
}