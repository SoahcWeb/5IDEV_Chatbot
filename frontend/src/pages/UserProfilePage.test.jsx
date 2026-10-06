import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const { refreshUserMock, changeEmailMock } = vi.hoisted(() => ({
  refreshUserMock: vi.fn(),
  changeEmailMock: vi.fn(),
}));

vi.mock('../api/client.js', () => ({
  api: {
    changeEmail: changeEmailMock,
    changePassword: vi.fn(),
  },
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { username: 'alice', email: 'old@example.com' },
    refreshUser: refreshUserMock,
  }),
}));

import UserProfilePage from './UserProfilePage.jsx';

describe('UserProfilePage', () => {
  it('refreshes the current user after a successful email change', async () => {
    changeEmailMock.mockResolvedValue({ detail: 'Email updated successfully.' });

    render(
      <MemoryRouter>
        <UserProfilePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('Nouvelle adresse e-mail'), {
      target: { value: 'new@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirmer l'adresse e-mail"), {
      target: { value: 'new@example.com' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Modifier mon e-mail' }));

    await waitFor(() => expect(changeEmailMock).toHaveBeenCalledWith({
      email: 'new@example.com',
      email_confirm: 'new@example.com',
    }));
    await waitFor(() => expect(refreshUserMock).toHaveBeenCalledTimes(1));
  });
});
