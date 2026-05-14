import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login';

// Mock react-router-dom navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
}));

// Mock auth utility
jest.mock('../../utils/auth', () => ({
  auth: {
    login: jest.fn(),
    logout: jest.fn(),
    isAuthenticated: jest.fn(() => false),
    getUser: jest.fn(() => null),
  },
}));

const renderLogin = () =>
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );

describe('Login component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Reset fetch mock
    global.fetch = undefined;
  });

  describe('rendering', () => {
    it('renders the welcome heading', () => {
      renderLogin();
      expect(screen.getByText('Welcome Back!')).toBeInTheDocument();
    });

    it('renders the sign in subtitle', () => {
      renderLogin();
      expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    });

    it('renders the email input field', () => {
      renderLogin();
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    it('renders the password input field', () => {
      renderLogin();
      expect(screen.getByLabelText('Password')).toBeInTheDocument();
    });

    it('renders the Login submit button', () => {
      renderLogin();
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });

    it('renders a link to Sign Up page', () => {
      renderLogin();
      expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
    });

    it('email input has type email', () => {
      renderLogin();
      expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email');
    });

    it('password input has type password', () => {
      renderLogin();
      expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    });

    it('does not show error alert initially', () => {
      renderLogin();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('form validation', () => {
    it('shows error when both fields are empty and form is submitted', async () => {
      renderLogin();
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all fields');
      });
    });

    it('shows error when email is filled but password is empty', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'test@example.com');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all fields');
      });
    });

    it('shows error when password is filled but email is empty', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Password'), 'password123');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all fields');
      });
    });

    it('clears previous error when user starts correcting', async () => {
      renderLogin();
      // Trigger error
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

      // Fill in email and submit again with empty password — new error replaces old
      await userEvent.type(screen.getByLabelText('Email'), 'a@b.com');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('form submission — success', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'abc123', user: { name: 'Test User' } }),
      });
    });

    it('calls fetch with correct URL and method', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/login'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('sends email and password in request body', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      const [, options] = global.fetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.email).toBe('user@example.com');
      expect(body.password).toBe('secret');
    });

    it('navigates after successful login', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
    });

    it('stores auth data in localStorage', async () => {
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
      // STORAGE_KEY comes from REACT_APP_STORAGE_KEY env var (set in client/.env)
      const storageKey = process.env.REACT_APP_STORAGE_KEY || 'app_auth';
      const stored = localStorage.getItem(storageKey);
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored);
      expect(parsed.token).toBe('abc123');
    });
  });

  describe('form submission — failure', () => {
    it('shows server error message when credentials are invalid', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      });
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'bad@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'wrong');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials');
      });
    });

    it('shows fallback error when server returns no error message', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'bad@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'wrong');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });

    it('shows error when token is missing from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ user: { name: 'Test' } }), // no token
      });
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent('Login failed: no token received');
      });
    });

    it('shows network error when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/network error/i);
      });
    });

    it('does not navigate on failed login', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' }),
      });
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'bad@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'wrong');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('shows "Signing in…" text while submitting', async () => {
      // Never resolves during the test
      global.fetch = jest.fn(() => new Promise(() => {}));
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /signing in/i })).toBeInTheDocument();
      });
    });

    it('disables the submit button while loading', async () => {
      global.fetch = jest.fn(() => new Promise(() => {}));
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
      });
    });

    it('disables email input while loading', async () => {
      global.fetch = jest.fn(() => new Promise(() => {}));
      renderLogin();
      await userEvent.type(screen.getByLabelText('Email'), 'user@example.com');
      await userEvent.type(screen.getByLabelText('Password'), 'secret');
      fireEvent.click(screen.getByRole('button', { name: /login/i }));

      await waitFor(() => {
        expect(screen.getByLabelText('Email')).toBeDisabled();
      });
    });
  });
});
