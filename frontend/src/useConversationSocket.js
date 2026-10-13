import { useEffect, useRef, useState } from 'react'

const TERMINAL_CODES = new Set([4401, 4403, 4404])
const INITIAL_BACKOFF = 1000
const MAX_BACKOFF = 15000

function buildUrl(baseUrl, conversationId, token) {
  const base = baseUrl || 'ws://localhost:8000'
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base
  return `${cleanBase}/ws/conversations/${conversationId}/?token=${token}`
}

function isTerminalClose(code) {
  return TERMINAL_CODES.has(code)
}

export function useConversationSocket({
  conversationId,
  token,
  baseUrl,
  onRead,
  onReconnect,
  enabled = true,
} = {}) {
  const [status, setStatus] = useState('idle')
  const [messages, setMessages] = useState([])
  const [events, setEvents] = useState([])
  const [error, setError] = useState(null)

  const socketRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const backoffRef = useRef(INITIAL_BACKOFF)
  const reconnectAttemptsRef = useRef(0)
  const onReadRef = useRef(onRead)
  const onReconnectRef = useRef(onReconnect)

  onReadRef.current = onRead
  onReconnectRef.current = onReconnect

  useEffect(() => {
    if (!enabled || !conversationId || !token) {
      setStatus('idle')
      return undefined
    }

    let active = true

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        globalThis.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
    }

    const scheduleReconnect = () => {
      clearReconnectTimer()

      const jitter = 1 + Math.random() * 0.4
      const delay = Math.floor(backoffRef.current * jitter)

      reconnectTimerRef.current = globalThis.setTimeout(() => {
        reconnectTimerRef.current = null
        reconnectAttemptsRef.current += 1
        createSocket()
        backoffRef.current = Math.min(MAX_BACKOFF, backoffRef.current * 2)
      }, delay)
    }

    const createSocket = () => {
      if (!active) return
      setStatus('connecting')

      const url = buildUrl(baseUrl, conversationId, token)

      // ⚠️ Utiliser globalThis.WebSocket pour les tests
      const ws = new globalThis.WebSocket(url)
      socketRef.current = ws

      ws.onopen = () => {
        if (!active) return
        setStatus('open')
        setError(null)
        // Reset du backoff après ouverture réussie
        backoffRef.current = INITIAL_BACKOFF
        const wasReconnect = reconnectAttemptsRef.current > 0
        reconnectAttemptsRef.current = 0
        if (wasReconnect) onReconnectRef.current?.()
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

        setStatus('closed')

        // Codes terminaux → pas de reconnexion
        if (isTerminalClose(event.code)) {
          setError({
            code: 'terminal_close',
            codeNumber: event.code,
            message: event.reason || 'Conversation inaccessible',
          })
          clearReconnectTimer()
          return
        }

        // Code 1006 → socket_error
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

        scheduleReconnect()
      }

      ws.onerror = () => {
        if (!active) return
        setError({ code: 'socket_error', message: 'WebSocket error' })
      }
    }

    createSocket()

    return () => {
      active = false
      clearReconnectTimer()
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, token, baseUrl, enabled])

  const sendMessage = (content) => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== 1) return false
    ws.send(JSON.stringify({ type: 'message.send', content }))
    return true
  }

  const markConversationRead = () => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== 1) return false
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