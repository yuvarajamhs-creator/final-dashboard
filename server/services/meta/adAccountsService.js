/**
 * Ad Accounts service: /me/adaccounts → cache in DB. UI reads from DB only.
 * Per Meta: GET /me/adaccounts with fields account_id,name,currency,timezone_name,account_status.
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { schedule, isMetaRateLimitError } = require('./rateLimiter');
const adAccountsRepo = require('../../repositories/metaAdAccountsRepository');

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

function getAccessToken() {
  const t = (process.env.META_ACCESS_TOKEN || '').trim();
  if (!t) throw new Error('META_ACCESS_TOKEN required');
  return t;
}

/**
 * Fetch ad accounts from Meta /me/adaccounts and upsert into DB.
 * @returns {Promise<Array<{account_id, account_name, currency, timezone, status}>>}
 */
async function fetchAndCache() {
  const accessToken = getAccessToken();
  const url = `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`;

  const run = async () => {
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        fields: 'account_id,name,currency,timezone_name,account_status',
        limit: 100,
      },
      timeout: 15000,
    });
    const raw = (data && data.data) ? data.data : [];
    const accounts = raw.map((acc) => ({
      account_id: (acc.account_id != null ? acc.account_id : acc.id || '').toString().replace(/^act_/, ''),
      name: (acc.name || acc.account_name || '').toString().trim() || `Account ${(acc.account_id || acc.id || '')}`,
      currency: acc.currency || 'USD',
      timezone_name: acc.timezone_name || 'UTC',
      account_status: acc.account_status != null ? acc.account_status : 0,
    })).filter((a) => a.account_id);

    await adAccountsRepo.upsert(accounts);
    return adAccountsRepo.list();
  };

  return schedule(run);
}

/**
 * List ad accounts from DB only. If empty, optionally fetch and cache (caller may call fetchAndCache first).
 */
async function listFromDb() {
  return adAccountsRepo.list();
}

module.exports = {
  fetchAndCache,
  listFromDb,
  getAccessToken,
  isMetaRateLimitError,
};
