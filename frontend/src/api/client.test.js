import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from './client.js'

describe('api.createConversation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('posts a private conversation to the private endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ id: 1 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.createConversation({ user_id: 2 })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/private/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_id: 2 }),
      }),
    )
  })

  it('posts a group conversation to the group endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ id: 3 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.createConversation({ name: 'Equipe', member_ids: [2, 3] })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/conversations/group/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Equipe', member_ids: [2, 3] }),
      }),
    )
  })

  it('throws on invalid payload', () => {
    expect(() => api.createConversation({})).toThrow(
      'Payload de conversation invalide'
    )
  })
})