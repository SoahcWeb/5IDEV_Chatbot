import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api/client.js'
import Sidebar from '../components/Sidebar.jsx'
import ConversationView from '../components/ConversationView.jsx'
import NewConversationModal from '../components/NewConversationModal.jsx'

export default function ChatPage() {
  const [conversations, setConversations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [params, setParams] = useSearchParams()

  const loadConversations = useCallback(async () => {
    try {
      const data = await api.listConversations()
      const list = Array.isArray(data) ? data : data.results ?? []
      setConversations(list)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    const c = params.get('c')
    if (c) setActiveId(Number(c))
  }, [params])

  const handleSelect = (id) => {
    setActiveId(id)
    setParams({ c: String(id) })
  }

  const active = conversations.find((c) => c.id === activeId)

  return (
    <div className={`chat-layout ${!active ? 'show-list' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelect}
        onNewConversation={() => setShowModal(true)}
      />
      {active ? (
        <ConversationView
          conversation={active}
          onBack={() => {
            setActiveId(null)
            setParams({})
          }}
        />
      ) : (
        <div className="main">
          <div className="empty">Sélectionne une conversation ou crées-en une.</div>
        </div>
      )}
      {showModal && (
        <NewConversationModal
          onClose={() => setShowModal(false)}
          onCreate={(conv) => {
            setShowModal(false)
            setConversations((prev) => [conv, ...prev])
            handleSelect(conv.id)
          }}
        />
      )}
    </div>
  )
}