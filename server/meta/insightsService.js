/**
 * Meta Insights live-fetch service: one API call per request, no loop over IDs.
 * Select All → call Meta with level + time_range only (aggregated). Explicit IDs → use filtering IN.
 * All calls go through a rate limiter (Bottleneck-style: max 2 concurrent, ~15/min) and an in-memory cache by (time_range, account, level, filters).
 *
 * ONE CALL, NO LOOP: We never iterate over campaign_ids or ad_ids to fire one Meta request per ID.
 * One request per (account, time_range, filter set). Filtering uses operator IN for selected IDs.
 *
 * META API REQUEST EXAMPLES:
 *
 * 1) Aggregated (Select All) — no campaign.id / ad.id in filtering, status only:
 *    GET https://graph.facebook.com/v21.0/act_{ad_account_id}/insights
 *      ?access_token=...
 *      &level=ad
 *      &time_increment=1
 *      &time_range={"since":"2024-01-01","until":"2024-01-07"}
 *      &fields=ad_id,ad_name,campaign_id,campaign_name,impressions,clicks,spend,actions,action_values,date_start,date_stop
 *      &limit=1000
 *      &filtering=[{"field":"campaign.effective_status","operator":"IN","value":["ACTIVE","PAUSED",...]},{"field":"ad.effective_status","operator":"IN","value":[...]}]
 *
 * 2) Filtered (explicit IDs) — use IN:
 *    Same URL, add to filtering:
 *      {"field":"campaign.id","operator":"IN","value":["123","456"]}
 *      {"field":"ad.id","operator":"IN","value":["a1","a2"]}
 *    Still one request with both filters.
 */

const axios = require('axios');

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

// Simple rate limiter: max 2 concurrent, ~15 requests per minute (minTime 4s). No external deps.
const RATE_QUEUE = [];
let rateRunning = 0;
let rateLastStart = 0;
const RATE_MAX_CONCURRENT = 2;
const RATE_MIN_MS = 4000;

function scheduleRateLimited(fn) {
  return new Promise((resolve, reject) => {
    RATE_QUEUE.push({ fn, resolve, reject });
    dequeueRate();
  });
}
function dequeueRate() {
  if (rateRunning >= RATE_MAX_CONCURRENT || RATE_QUEUE.length === 0) return;
  const now = Date.now();
  if (now - rateLastStart < RATE_MIN_MS && rateRunning > 0) {
    setTimeout(dequeueRate, RATE_MIN_MS - (now - rateLastStart));
    return;
  }
  const { fn, resolve, reject } = RATE_QUEUE.shift();
  rateRunning++;
  rateLastStart = Date.now();
  Promise.resolve(fn()).then(resolve, reject).finally(() => {
    rateRunning--;
    dequeueRate();
  });
}

// In-memory cache: key = (from, to, adAccountId, campaignIdKey, adIdKey), value = { data, expires }
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const cache = new Map();

function cacheKey(from, to, adAccountId, campaignIdForKey, adIdForKey) {
  return `${from}|${to}|${adAccountId}|${campaignIdForKey || '*'}|${adIdForKey || '*'}`;
}

const STATUS_FILTER = [
  { field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_REVIEW', 'REJECTED', 'PENDING_REVIEW', 'LEARNING', 'ENDED'] },
  { field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_REVIEW', 'REJECTED', 'PENDING_REVIEW', 'LEARNING', 'ENDED'] },
];

/**
 * Build filtering array for Meta Insights API.
 * Aggregated (Select All): status only. Filtered: add campaign.id IN and/or ad.id IN. One request, no loop.
 */
function buildFiltering(isAllCampaigns, isAllAds, campaignIds, adIds) {
  const list = [...STATUS_FILTER];
  if (!isAllCampaigns && campaignIds && campaignIds.length > 0) {
    list.push({ field: 'campaign.id', operator: 'IN', value: campaignIds.map(String) });
  }
  if (!isAllAds && adIds && adIds.length > 0) {
    list.push({ field: 'ad.id', operator: 'IN', value: adIds.map(String) });
  }
  return list;
}

/**
 * Fetch insights from Meta API. One call per (account, request). Uses rate limiter and cache.
 * @param {object} opts - { accessToken, adAccountId, from, to, isAllCampaigns, isAllAds, campaignIds, adIds }
 * @returns {Promise<object[]>} - Raw Meta insight objects (ad-level)
 */
async function fetchInsightsFromMetaLive(opts) {
  const {
    accessToken,
    adAccountId,
    from,
    to,
    isAllCampaigns = true,
    isAllAds = true,
    campaignIds = [],
    adIds = [],
  } = opts || {};

  const normId = (id) => (id && String(id).replace(/^act_/, '')) || '';
  const accId = normId(adAccountId);
  if (!accId || !accessToken || !from || !to) {
    throw new Error('insightsService: accessToken, adAccountId, from, to are required');
  }

  const campaignIdForKey = isAllCampaigns ? '' : campaignIds.join(',');
  const adIdForKey = isAllAds ? '' : adIds.join(',');
  const key = cacheKey(from, to, accId, campaignIdForKey, adIdForKey);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) {
    return hit.data;
  }

  const run = async () => {
    const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accId}/insights`;
    const timeRange = JSON.stringify({ since: from, until: to });
    const filtering = buildFiltering(isAllCampaigns, isAllAds, campaignIds, adIds);

    const params = {
      access_token: accessToken,
      level: 'ad',
      time_increment: 1,
      time_range: timeRange,
      fields: 'ad_id,ad_name,campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions,action_values,date_start,date_stop',
      limit: 1000,
      filtering: JSON.stringify(filtering),
    };

    let allRows = [];
    let currentParams = { ...params };
    let pageCount = 0;
    const maxPages = 20;

    do {
      const res = await axios.get(url, { params: currentParams, timeout: 60000 });
      const data = res.data;
      const chunk = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      allRows = allRows.concat(chunk);

      const nextUrl = data.paging && data.paging.next;
      if (nextUrl && pageCount < maxPages) {
        const u = new URL(data.paging.next);
        currentParams = { ...params, after: u.searchParams.get('after') };
        pageCount++;
      } else {
        break;
      }
    } while (true);

    cache.set(key, { data: allRows, expires: now + CACHE_TTL_MS });
    return allRows;
  };

  return scheduleRateLimited(run);
}

module.exports = {
  fetchInsightsFromMetaLive,
  cacheKey,
  buildFiltering,
};
