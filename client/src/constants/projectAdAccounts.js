/**
 * Shared project → ad account mapping for Ads Analytics and Best Performing Ad.
 * Client-only; API does not return project.
 */

export const PROJECT_AD_ACCOUNT_NAMES = {
  'Free Webinar': [
    'My Health School – Test Account',
    'My Health School – Current',
    'MHS Integfarms – 1',
    'MHS Integfarms – 2',
    'MHS S-1',
    'MHS 2025',
    'My Health School 2025',
    'New MHS 01',
    'Integfarms MHS 01',
    'Integfarms MHS 02',
    'Integfarms 01',
    'MHS Ad Account 2024'
  ],
  'Paid Webinar': ['MHS S-2'],
  'YouTube Ads': [
    'Google Ad Account – Integfarms My Health School (257-194-7778)',
    'Meta – Integfarms 02'
  ],
  'Direct Walk-in': ['MHS Ad Account 2024'],
  'Dental': ['MHS Dental Care'],
  'True Food Store': ['Integfarms'],
  'Integfarms': []
};

export const PROJECT_ORDER = ['Free Webinar', 'Paid Webinar', 'YouTube Ads', 'Direct Walk-in', 'Dental', 'True Food Store', 'Integfarms'];

/** Normalize name for matching (trim, case-insensitive). */
export const normalizeAccountName = (name) => (name || '').toString().trim().toLowerCase();

/**
 * Build ad accounts grouped by project.
 * @param {Array} adAccounts - List of account objects with account_id/id and account_name/name
 * @returns {{ [projectName]: Array<{ value: string, displayName: string }>, Other: Array }}
 */
export function buildAdAccountsByProject(adAccounts) {
  const filtered = (adAccounts || []).filter((acc) => {
    const displayName = acc.account_name || acc.name || `Account ${acc.account_id || acc.id}`;
    return !displayName.toLowerCase().includes('read-only');
  });
  const nameToAccount = new Map();
  filtered.forEach((acc) => {
    const id = acc.account_id || acc.id;
    const displayName = (acc.account_name || acc.name || `Account ${id}`).trim();
    nameToAccount.set(normalizeAccountName(displayName), { id, displayName, account: acc });
  });
  const used = new Set();
  const result = {};
  PROJECT_ORDER.forEach((projectName) => {
    const names = PROJECT_AD_ACCOUNT_NAMES[projectName] || [];
    result[projectName] = names
      .map((name) => {
        const key = normalizeAccountName(name);
        const entry = nameToAccount.get(key);
        if (entry && !used.has(entry.id)) {
          used.add(entry.id);
          return { value: entry.id, displayName: entry.displayName };
        }
        return null;
      })
      .filter(Boolean);
  });
  result['Other'] = filtered
    .filter((acc) => !used.has(acc.account_id || acc.id))
    .map((acc) => ({
      value: acc.account_id || acc.id,
      displayName: (acc.account_name || acc.name || `Account ${acc.account_id || acc.id}`).trim()
    }));
  return result;
}
