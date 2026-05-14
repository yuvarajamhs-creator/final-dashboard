import {
  PROJECT_AD_ACCOUNT_IDS,
  PROJECT_ORDER,
  ALL_SPECIFIED_ACCOUNT_IDS,
  normalizeAccountId,
  normalizeAccountName,
  buildAdAccountsByProject,
} from './projectAdAccounts';

describe('projectAdAccounts constants', () => {
  describe('PROJECT_ORDER', () => {
    it('contains all expected project names', () => {
      expect(PROJECT_ORDER).toContain('Free Webinar');
      expect(PROJECT_ORDER).toContain('Paid Webinar');
      expect(PROJECT_ORDER).toContain('YouTube Ads');
      expect(PROJECT_ORDER).toContain('Direct Walk-in');
      expect(PROJECT_ORDER).toContain('Dental');
      expect(PROJECT_ORDER).toContain('True Food Store');
      expect(PROJECT_ORDER).toContain('Integfarms');
    });

    it('has exactly 7 projects', () => {
      expect(PROJECT_ORDER).toHaveLength(7);
    });
  });

  describe('PROJECT_AD_ACCOUNT_IDS', () => {
    it('has entries for each project in PROJECT_ORDER', () => {
      PROJECT_ORDER.forEach((project) => {
        expect(PROJECT_AD_ACCOUNT_IDS).toHaveProperty(project);
        expect(Array.isArray(PROJECT_AD_ACCOUNT_IDS[project])).toBe(true);
      });
    });

    it('Free Webinar has 12 account IDs', () => {
      expect(PROJECT_AD_ACCOUNT_IDS['Free Webinar']).toHaveLength(12);
    });

    it('Paid Webinar has 1 account ID', () => {
      expect(PROJECT_AD_ACCOUNT_IDS['Paid Webinar']).toHaveLength(1);
    });

    it('YouTube Ads has 1 account ID', () => {
      expect(PROJECT_AD_ACCOUNT_IDS['YouTube Ads']).toHaveLength(1);
    });

    it('Integfarms has 0 account IDs', () => {
      expect(PROJECT_AD_ACCOUNT_IDS['Integfarms']).toHaveLength(0);
    });

    it('all IDs are non-empty strings without act_ prefix', () => {
      PROJECT_ORDER.forEach((project) => {
        PROJECT_AD_ACCOUNT_IDS[project].forEach((id) => {
          expect(typeof id).toBe('string');
          expect(id.length).toBeGreaterThan(0);
          expect(id.startsWith('act_')).toBe(false);
        });
      });
    });
  });

  describe('ALL_SPECIFIED_ACCOUNT_IDS', () => {
    it('is an array', () => {
      expect(Array.isArray(ALL_SPECIFIED_ACCOUNT_IDS)).toBe(true);
    });

    it('has no duplicate IDs', () => {
      const unique = new Set(ALL_SPECIFIED_ACCOUNT_IDS);
      expect(unique.size).toBe(ALL_SPECIFIED_ACCOUNT_IDS.length);
    });

    it('contains IDs from Free Webinar', () => {
      PROJECT_AD_ACCOUNT_IDS['Free Webinar'].forEach((id) => {
        expect(ALL_SPECIFIED_ACCOUNT_IDS).toContain(id);
      });
    });

    it('contains the Paid Webinar ID', () => {
      expect(ALL_SPECIFIED_ACCOUNT_IDS).toContain('332450076623103');
    });

    it('contains the YouTube Ads ID', () => {
      expect(ALL_SPECIFIED_ACCOUNT_IDS).toContain('1512093733230882');
    });
  });
});

describe('normalizeAccountId', () => {
  it('strips act_ prefix (lowercase)', () => {
    expect(normalizeAccountId('act_123456')).toBe('123456');
  });

  it('strips ACT_ prefix (uppercase)', () => {
    expect(normalizeAccountId('ACT_123456')).toBe('123456');
  });

  it('returns the ID unchanged when no prefix', () => {
    expect(normalizeAccountId('123456')).toBe('123456');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeAccountId('  123456  ')).toBe('123456');
  });

  it('returns empty string for null', () => {
    expect(normalizeAccountId(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeAccountId(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(normalizeAccountId('')).toBe('');
  });

  it('handles numeric input', () => {
    expect(normalizeAccountId(123456)).toBe('123456');
  });
});

describe('normalizeAccountName', () => {
  it('converts to lowercase', () => {
    expect(normalizeAccountName('My Health School')).toBe('my health school');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeAccountName('  MHS  ')).toBe('mhs');
  });

  it('collapses multiple spaces to single space', () => {
    expect(normalizeAccountName('MHS  Test   Account')).toBe('mhs test account');
  });

  it('replaces em dash (–) with hyphen', () => {
    expect(normalizeAccountName('MHS – Test')).toBe('mhs - test');
  });

  it('replaces em dash (—) with hyphen', () => {
    expect(normalizeAccountName('MHS — Test')).toBe('mhs - test');
  });

  it('handles null gracefully', () => {
    expect(normalizeAccountName(null)).toBe('');
  });

  it('handles undefined gracefully', () => {
    expect(normalizeAccountName(undefined)).toBe('');
  });

  it('handles empty string', () => {
    expect(normalizeAccountName('')).toBe('');
  });
});

describe('buildAdAccountsByProject', () => {
  const mockAccounts = [
    { account_id: '1118966742784490', account_name: 'My Health School – Test Account' },
    { account_id: '332450076623103', account_name: 'MHS S-2' },
    { account_id: '1512093733230882', account_name: 'Integfarms 02' },
    { account_id: '327236376911765', account_name: 'MHS Dental Care' },
    { account_id: '999999999999999', account_name: 'Unknown Account' }, // not in any project
  ];

  it('returns an object with a key for each project', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    PROJECT_ORDER.forEach((project) => {
      expect(result).toHaveProperty(project);
    });
  });

  it('returns an Other key with empty array', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    expect(result).toHaveProperty('Other');
    expect(result['Other']).toEqual([]);
  });

  it('maps known account into the correct project', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    const fwAccounts = result['Free Webinar'];
    const firstEntry = fwAccounts.find((a) => a.value === '1118966742784490');
    expect(firstEntry).toBeDefined();
    expect(firstEntry.displayName).toBe('My Health School – Test Account');
  });

  it('maps Paid Webinar account correctly', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    expect(result['Paid Webinar']).toHaveLength(1);
    expect(result['Paid Webinar'][0].value).toBe('332450076623103');
    expect(result['Paid Webinar'][0].displayName).toBe('MHS S-2');
  });

  it('uses fallback display name when account not in provided list', () => {
    const result = buildAdAccountsByProject([]);
    const fwAccounts = result['Free Webinar'];
    // First ID: 1118966742784490 should use fallback
    expect(fwAccounts[0].displayName).toBe('My Health School – Test Account');
  });

  it('handles null/undefined input gracefully', () => {
    expect(() => buildAdAccountsByProject(null)).not.toThrow();
    expect(() => buildAdAccountsByProject(undefined)).not.toThrow();
  });

  it('handles accounts with id field instead of account_id', () => {
    const accounts = [{ id: '332450076623103', name: 'MHS S-2' }];
    const result = buildAdAccountsByProject(accounts);
    expect(result['Paid Webinar'][0].displayName).toBe('MHS S-2');
  });

  it('handles accounts with act_ prefixed IDs', () => {
    const accounts = [{ account_id: 'act_332450076623103', account_name: 'MHS S-2' }];
    const result = buildAdAccountsByProject(accounts);
    expect(result['Paid Webinar'][0].displayName).toBe('MHS S-2');
  });

  it('does not include unknown accounts in any project', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    const allProjectAccounts = PROJECT_ORDER.flatMap((p) =>
      (result[p] || []).map((a) => a.value)
    );
    expect(allProjectAccounts).not.toContain('999999999999999');
  });

  it('each entry has value and displayName properties', () => {
    const result = buildAdAccountsByProject(mockAccounts);
    PROJECT_ORDER.forEach((project) => {
      result[project].forEach((entry) => {
        expect(entry).toHaveProperty('value');
        expect(entry).toHaveProperty('displayName');
      });
    });
  });
});
