import { useEffect, useRef, useState } from 'react'

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
  const [events, setEvents] = useState([])   // ← nouveaux événements : deleted / updated
  const [error, setError] = useState(null)

  const socketRef = useRef(null)
  const retryRef = useRef(0)
  const retryTimerRef = useRef(null)
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
        if (!active) return
        setStatus('closed')
        if (event?.code === 4401) return
        const delay = Math.min(
          1000 * 2 ** Math.min(retryRef.current, 5),
          15000,
        )
        retryRef.current += 1
        retryTimerRef.current = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        if (!active) return
        setError({ type: 'error', detail: 'WebSocket error' })
      }
    }

    connect()

    return () => {
      active = false
      if (retryTimerRef.current) window.clearTimeout(retryTimerRef.current)
      socketRef.current?.close()
      socketRef.current = null
      wasOpenRef.current = false
    }
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
    events,   // ← NOUVEAU
    error,
    sendMessage,
    markConversationRead,
  }
}