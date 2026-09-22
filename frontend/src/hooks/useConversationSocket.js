// Stub — sera remplacé par le vrai WebSocket (3ᵉ membre)
// En attendant, sendMessage = null → fallback REST.
export function useConversationSocket(conversationId, { onMessage } = {}) {
  void conversationId
  void onMessage
  return {
    sendMessage: null,
    markRead: null,
  }
}