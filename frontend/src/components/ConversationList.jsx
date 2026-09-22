export default function ConversationList({ conversations, activeId, onSelect }) {
  if (!conversations.length) {
    return (
      <div className="empty">
        Aucune conversation.
        <br />
        Crée-en une !
      </div>
    )
  }
  return (
    <div className="conv-list">
      {conversations.map((c) => (
        <div
          key={c.id}
          className={`conv-item ${c.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(c.id)}
        >
          <div>
            <div className="name">
              {c.name || c.title || `Conversation #${c.id}`}
            </div>
            {c.last_message?.content && (
              <div className="preview">{c.last_message.content.slice(0, 40)}</div>
            )}
          </div>
          {/* Emplacement pour le badge unread_count (3ᵉ membre) */}
          {c.unread_count > 0 && <span className="badge">{c.unread_count}</span>}
        </div>
      ))}
    </div>
  )
}