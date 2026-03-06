/**
 * Lead Saturation Detection: campaign-level scoring from Meta insights + Leads duplicate rate.
 * Score: frequency > 3 (+30), CPL increase > 30% (+25), leads drop > 25% (+25), duplicate_rate > 20% (+20).
 * Status: score < 40 Healthy, 40-60 Warning, > 60 Saturated.
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { getDuplicateRateByCampaign } = require('../repositories/leadsRepository');
const adAccountsService = require('./meta/adAccountsService');
const { supabase } = require('../supabase');

const META_API_VERSION = process.env.META_API_VERSION || 'v21.0';

function getCredentials() {
  const accessToken = (process.env.META_ACCESS_TOKEN || '').trim();
  const adAccountId = (process.env.META_AD_ACCOUNT_ID || '').trim();
  if (!accessToken) throw new Error('META_ACCESS_TOKEN required');
  return { accessToken, adAccountId: adAccountId ? adAccountId.replace(/^act_/, '') : null };
}

function getLeadsFromActions(actions) {
  if (!Array.isArray(actions)) return 0;
  const entry = actions.find((a) => a && a.action_type === 'lead');
  return entry && entry.value != null ? Number(entry.value) || 0 : 0;
}

/**
 * Fetch campaign-level insights for one ad account and date range.
 * Fields include reach for frequency.
 */
async function fetchCampaignInsights(adAccountId, accessToken, from, to) {
  const accId = (adAccountId || '').toString().replace(/^act_/, '');
  if (!accId || !accessToken) return [];

  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accId}/insights`;
  const params = {
    access_token: accessToken,
    level: 'campaign',
    time_increment: 1,
    time_range: JSON.stringify({ since: from, until: to }),
    fields: 'campaign_id,campaign_name,impressions,reach,spend,clicks,actions,date_start,date_stop',
    limit: 500,
    filtering: JSON.stringify([
      { field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_REVIEW', 'REJECTED', 'PENDING_REVIEW', 'LEARNING', 'ENDED'] },
    ]),
  };

  let all = [];
  let nextUrl = null;
  let pageCount = 0;
  do {
    const res = nextUrl
      ? await axios.get(nextUrl, { timeout: 60000 })
      : await axios.get(url, { params, timeout: 60000 });
    const data = res.data || {};
    const chunk = Array.isArray(data.data) ? data.data : [];
    all = all.concat(chunk);
    nextUrl = data.paging && data.paging.next && pageCount < 10 ? data.paging.next : null;
    pageCount++;
  } while (nextUrl);

  return all;
}

/**
 * Aggregate campaign-level rows by campaign_id (sum metrics, parse leads from actions).
 */
function aggregateByCampaign(rows) {
  const byCampaign = new Map();
  for (const row of rows) {
    const cid = (row.campaign_id || '').toString();
    const name = (row.campaign_name || '').toString() || cid;
    const impressions = Number(row.impressions) || 0;
    const reach = Number(row.reach) || 0;
    const spend = Number(row.spend) || 0;
    const clicks = Number(row.clicks) || 0;
    const leads = getLeadsFromActions(row.actions);

    if (!byCampaign.has(cid)) {
      byCampaign.set(cid, { campaign_id: cid, campaign_name: name, impressions: 0, reach: 0, spend: 0, clicks: 0, leads: 0 });
    }
    const agg = byCampaign.get(cid);
    agg.impressions += impressions;
    agg.reach += reach;
    agg.spend += spend;
    agg.clicks += clicks;
    agg.leads += leads;
  }
  return Array.from(byCampaign.values());
}

function computeScore(frequency, cplIncreasePct, leadDropPct, duplicateRatePct) {
  let score = 0;
  if (frequency > 3) score += 30;
  if (cplIncreasePct > 30) score += 25;
  if (leadDropPct > 25) score += 25;
  if (duplicateRatePct > 20) score += 20;
  return score;
}

function getStatus(score) {
  if (score > 60) return 'Saturated';
  if (score >= 40) return 'Warning';
  return 'Healthy';
}

/**
 * Run saturation detection for date range (default last 7d vs previous 7d).
 * @param {object} opts - { dateRange: { from, to }, adAccountId? }
 * @returns {Promise<{ success, campaigns, summary, error? }>}
 */
async function runSaturationAnalysis(opts = {}) {
  const { dateRange, adAccountId: singleAccountId } = opts || {};
  const toDate = dateRange && dateRange.to ? dateRange.to : new Date().toISOString().split('T')[0];
  const fromDate = dateRange && dateRange.from ? dateRange.from : (() => {
    const d = new Date(toDate);
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  })();
  const prevTo = (() => { const d = new Date(fromDate); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; })();
  const prevFrom = (() => { const d = new Date(prevTo); d.setDate(d.getDate() - 6); return d.toISOString().split('T')[0]; })();

  let credentials;
  try {
    credentials = getCredentials();
  } catch (e) {
    return { success: false, error: e.message, campaigns: [], summary: {} };
  }

  let accounts = [];
  if (singleAccountId) {
    const id = (singleAccountId || '').toString().replace(/^act_/, '');
    if (id) accounts = [{ account_id: id, name: `Account ${id}` }];
  }
  if (accounts.length === 0) {
    try {
      await adAccountsService.fetchAndCache().catch(() => {});
      accounts = await adAccountsService.listFromDb();
    } catch (e) {
      console.warn('[saturationService] No ad accounts from DB, using env account:', e.message);
      if (credentials.adAccountId) {
        accounts = [{ account_id: credentials.adAccountId, name: 'Default' }];
      }
    }
  }
  if (accounts.length === 0) {
    return { success: false, error: 'No ad accounts available', campaigns: [], summary: {} };
  }

  const accessToken = credentials.accessToken;
  const duplicateRatesCurrent = await getDuplicateRateByCampaign(fromDate, toDate).catch(() => []);
  const duplicateMap = new Map(duplicateRatesCurrent.map((r) => [r.campaign_id, r.duplicate_rate]));

  const allCampaigns = [];
  for (const acc of accounts) {
    const accId = acc.account_id || acc.id;
    if (!accId) continue;
    let currentRows = [];
    let previousRows = [];
    try {
      currentRows = await fetchCampaignInsights(accId, accessToken, fromDate, toDate);
      previousRows = await fetchCampaignInsights(accId, accessToken, prevFrom, prevTo);
    } catch (err) {
      console.error('[saturationService] Meta API error for account', accId, err.message);
      continue;
    }

    const currentAgg = aggregateByCampaign(currentRows);
    const previousAgg = new Map(aggregateByCampaign(previousRows).map((c) => [c.campaign_id, c]));

    for (const cur of currentAgg) {
      const prev = previousAgg.get(cur.campaign_id) || {};
      const reach = cur.reach || 0;
      const frequency = reach > 0 ? cur.impressions / reach : 0;
      const leadsCur = cur.leads || 0;
      const spendCur = cur.spend || 0;
      const cplCur = leadsCur > 0 ? spendCur / leadsCur : 0;
      const leadsPrev = prev.leads || 0;
      const spendPrev = prev.spend || 0;
      const cplPrev = leadsPrev > 0 ? spendPrev / leadsPrev : 0;

      let cplIncreasePct = 0;
      if (cplPrev > 0 && cplCur > cplPrev) {
        cplIncreasePct = ((cplCur - cplPrev) / cplPrev) * 100;
      }
      let leadDropPct = 0;
      if (leadsPrev > 0 && leadsCur < leadsPrev) {
        leadDropPct = ((leadsPrev - leadsCur) / leadsPrev) * 100;
      }
      const duplicateRatePct = (duplicateMap.get(cur.campaign_id) || 0) * 100;
      const score = computeScore(frequency, cplIncreasePct, leadDropPct, duplicateRatePct);
      const status = getStatus(score);

      const row = {
        campaign_id: cur.campaign_id,
        campaign_name: cur.campaign_name,
        ad_account_id: accId,
        frequency: Math.round(frequency * 100) / 100,
        cpl: Math.round(cplCur * 100) / 100,
        duplicate_rate: Math.round(duplicateRatePct * 100) / 100,
        score,
        status,
        period_from: fromDate,
        period_to: toDate,
      };
      allCampaigns.push(row);
    }
  }

  if (supabase) {
    const toInsert = allCampaigns.map((r) => ({
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      ad_account_id: r.ad_account_id,
      frequency: r.frequency,
      cpl: r.cpl,
      duplicate_rate: r.duplicate_rate / 100,
      score: r.score,
      status: r.status,
      period_from: r.period_from,
      period_to: r.period_to,
    }));
    if (toInsert.length > 0) {
      await supabase.from('campaign_saturation_log').insert(toInsert).then(({ error }) => {
        if (error) console.error('[saturationService] Log insert error:', error.message);
      });
    }
  }

  const saturated = allCampaigns.filter((c) => c.status === 'Saturated');
  const warning = allCampaigns.filter((c) => c.status === 'Warning');
  const summary = {
    total: allCampaigns.length,
    saturated: saturated.length,
    warning: warning.length,
    healthy: allCampaigns.length - saturated.length - warning.length,
    period_from: fromDate,
    period_to: toDate,
  };

  return {
    success: true,
    campaigns: allCampaigns,
    summary,
  };
}

module.exports = {
  runSaturationAnalysis,
  fetchCampaignInsights,
  aggregateByCampaign,
  computeScore,
  getStatus,
};
