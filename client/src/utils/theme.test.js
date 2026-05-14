import { getCurrentTheme, getSystemTheme, getEffectiveTheme, setTheme } from './theme';

describe('theme utility', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset document attributes
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-preference');
  });

  describe('getCurrentTheme', () => {
    it('returns "light" when no theme is stored', () => {
      expect(getCurrentTheme()).toBe('light');
    });

    it('returns the stored theme', () => {
      localStorage.setItem('theme', 'dark');
      expect(getCurrentTheme()).toBe('dark');
    });

    it('returns custom theme names', () => {
      localStorage.setItem('theme', 'sunset');
      expect(getCurrentTheme()).toBe('sunset');
    });

    it('returns system when system is stored', () => {
      localStorage.setItem('theme', 'system');
      expect(getCurrentTheme()).toBe('system');
    });
  });

  describe('getSystemTheme', () => {
    it('returns a string (light or dark)', () => {
      const result = getSystemTheme();
      expect(['light', 'dark']).toContain(result);
    });
  });

  describe('getEffectiveTheme', () => {
    it('returns stored theme when not system', () => {
      localStorage.setItem('theme', 'dark');
      expect(getEffectiveTheme()).toBe('dark');
    });

    it('returns system-derived theme when preference is system', () => {
      localStorage.setItem('theme', 'system');
      const result = getEffectiveTheme();
      expect(['light', 'dark']).toContain(result);
    });

    it('returns light when no theme stored', () => {
      // default is light via getCurrentTheme
      expect(getEffectiveTheme()).toBe('light');
    });
  });

  describe('setTheme', () => {
    it('saves theme to localStorage', () => {
      setTheme('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('sets data-theme attribute on documentElement', () => {
      setTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('sets data-theme-preference to the preference value', () => {
      setTheme('dark');
      expect(document.documentElement.getAttribute('data-theme-preference')).toBe('dark');
    });

    it('persists across multiple calls, last wins', () => {
      setTheme('dark');
      setTheme('light');
      expect(localStorage.getItem('theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('dispatches a themechange CustomEvent', () => {
      const listener = jest.fn();
      window.addEventListener('themechange', listener);
      setTheme('dark');
      window.removeEventListener('themechange', listener);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('includes theme detail in the dispatched event', () => {
      let eventDetail = null;
      const listener = (e) => { eventDetail = e.detail; };
      window.addEventListener('themechange', listener);
      setTheme('dark');
      window.removeEventListener('themechange', listener);
      expect(eventDetail).toMatchObject({ theme: 'dark', preference: 'dark' });
    });

    it('handles system preference: sets effective theme on document', () => {
      setTheme('system');
      const attr = document.documentElement.getAttribute('data-theme');
      expect(['light', 'dark']).toContain(attr);
    });

    it('stores "system" in localStorage when system is chosen', () => {
      setTheme('system');
      expect(localStorage.getItem('theme')).toBe('system');
    });
  });
});
