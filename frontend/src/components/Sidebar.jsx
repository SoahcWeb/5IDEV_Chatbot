import { useAuth } from '../context/AuthContext.jsx'
import ConversationList from './ConversationList.jsx'

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewConversation,
}) {
  const { user, logout } = useAuth()
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-user">
          Connecté en tant que
          <strong>{user?.username}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={onNewConversation} title="Nouvelle conversation">
            +
          </button>
          <button className="btn btn-ghost" onClick={logout} title="Déconnexion">
            ⎋
          </button>
        </div>
      </div>
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelect}
      />
    </aside>
  )
}