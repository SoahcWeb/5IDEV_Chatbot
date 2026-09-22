import { useState } from 'react'

export default function MessageInput({ onSend, disabled }) {
  const [value, setValue] = useState('')

  const submit = () => {
    const v = value.trim()
    if (!v) return
    onSend(v)
    setValue('')
  }

  return (
    <div className="msg-input">
      <textarea
        placeholder="Écris un message… (Entrée pour envoyer)"
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button className="btn" onClick={submit} disabled={disabled || !value.trim()}>
        Envoyer
      </button>
    </div>
  )
}