import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import ConversationList from './ConversationList.jsx'

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNewConversation,
  notificationPermission,
  onEnableNotifications,
}) {
  const { user, logout } = useAuth()

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-user">
          Connecté en tant que
          <strong>{user?.username}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className="btn btn-ghost" to="/app/profile" title="Profil utilisateur" type="button">
            Profil
          </Link>
          <button className="btn" onClick={onNewConversation} title="Nouvelle conversation" type="button">
            +
          </button>
          <button className="btn btn-ghost" onClick={logout} title="Déconnexion" type="button">
            ⎋
          </button>
        </div>
      </div>
      {notificationPermission !== 'granted' && (
        <button
          className="notification-opt-in"
          onClick={onEnableNotifications}
          type="button"
        >
          Activer les notifications
        </button>
      )}
      <ConversationList
        conversations={conversations}
        activeId={activeId}
        onSelect={onSelect}
      />
    </aside>
  )
}