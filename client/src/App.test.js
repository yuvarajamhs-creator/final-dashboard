import { render, screen } from '@testing-library/react';
import App from './App';

// Mock ProtectedRoute so protected pages render without auth checks
jest.mock('./components/ProtectedRoute', () => ({
  __esModule: true,
  default: ({ children }) => <>{children}</>,
}));

// Silence console.error noise from heavy page components
beforeAll(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterAll(() => console.error.mockRestore());

describe('App routing', () => {
  it('renders without crashing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it('renders Login page at /login', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  it('shows Sign Up link on the Login page', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByRole('link', { name: /sign up/i })).toBeInTheDocument();
  });
});
