import { auth } from './auth';

describe('auth utility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('login', () => {
    it('stores the value in localStorage under loggedInUser', () => {
      auth.login('testUser');
      expect(localStorage.getItem('loggedInUser')).toBe('testUser');
    });

    it('overwrites a previous login', () => {
      auth.login('user1');
      auth.login('user2');
      expect(localStorage.getItem('loggedInUser')).toBe('user2');
    });

    it('stores token string when called with token', () => {
      auth.login('eyJhbGciOiJIUzI1NiJ9.test');
      expect(localStorage.getItem('loggedInUser')).toBe('eyJhbGciOiJIUzI1NiJ9.test');
    });
  });

  describe('logout', () => {
    it('removes loggedInUser from localStorage', () => {
      localStorage.setItem('loggedInUser', 'testUser');
      auth.logout();
      expect(localStorage.getItem('loggedInUser')).toBeNull();
    });

    it('does not throw when called without a prior login', () => {
      expect(() => auth.logout()).not.toThrow();
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no user is stored', () => {
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('returns true after login', () => {
      auth.login('testUser');
      expect(auth.isAuthenticated()).toBe(true);
    });

    it('returns false after logout', () => {
      auth.login('testUser');
      auth.logout();
      expect(auth.isAuthenticated()).toBe(false);
    });

    it('returns false for empty string stored', () => {
      localStorage.setItem('loggedInUser', '');
      expect(auth.isAuthenticated()).toBe(false);
    });
  });

  describe('getUser', () => {
    it('returns null when no user is stored', () => {
      expect(auth.getUser()).toBeNull();
    });

    it('returns the stored user value', () => {
      auth.login('john@example.com');
      expect(auth.getUser()).toBe('john@example.com');
    });

    it('returns null after logout', () => {
      auth.login('john@example.com');
      auth.logout();
      expect(auth.getUser()).toBeNull();
    });
  });
});
