/**
 * Creative Fatigue Detection: ad-level scoring from Meta insights.
 * fatigue_score: frequency > 3 (+30), CTR drop > 25% (+30), CPL increase > 30% (+40).
 * Status: 0-40 Healthy, 40-60 Warning, 60+ Fatigued.
 */

const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
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
 * Fetch ad-level insights for one ad account and date range (with reach for frequency).
 */
async function fetchAdInsights(adAccountId, accessToken, from, to) {
  const accId = (adAccountId || '').toString().replace(/^act_/, '');
  if (!accId || !accessToken) return [];

  const url = `https://graph.facebook.com/${META_API_VERSION}/act_${accId}/insights`;
  const params = {
    access_token: accessToken,
    level: 'ad',
    time_increment: 1,
    time_range: JSON.stringify({ since: from, until: to }),
    fields: 'ad_id,ad_name,campaign_id,campaign_name,impressions,reach,clicks,spend,ctr,cpc,actions,date_start,date_stop',
    limit: 500,
    filtering: JSON.stringify([
      { field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_REVIEW', 'REJECTED', 'PENDING_REVIEW', 'LEARNING', 'ENDED'] },
      { field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'IN_REVIEW', 'REJECTED', 'PENDING_REVIEW', 'LEARNING', 'ENDED'] },
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
    nextUrl = data.paging && data.paging.next && pageCount < 15 ? data.paging.next : null;
    pageCount++;
  } while (nextUrl);

  return all;
}

/**
 * Aggregate ad-level rows by ad_id (sum metrics, compute CTR if missing).
 */
function aggregateByAd(rows) {
  const byAd = new Map();
  for (const row of rows) {
    const adId = (row.ad_id || '').toString();
    const name = (row.ad_name || '').toString() || adId;
    const campaignId = (row.campaign_id || '').toString();
    const campaignName = (row.campaign_name || '').toString();
    const impressions = Number(row.impressions) || 0;
    const reach = Number(row.reach) || 0;
    const clicks = Number(row.clicks) || 0;
    const spend = Number(row.spend) || 0;
    const leads = getLeadsFromActions(row.actions);
    const ctr = row.ctr != null ? Number(row.ctr) : (impressions > 0 ? (clicks / impressions) * 100 : 0);

    if (!byAd.has(adId)) {
      byAd.set(adId, {
        ad_id: adId,
        ad_name: name,
        campaign_id: campaignId,
        campaign_name: campaignName,
        impressions: 0,
        reach: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        ctrSum: 0,
        ctrCount: 0,
      });
    }
    const agg = byAd.get(adId);
    agg.impressions += impressions;
    agg.reach += reach;
    agg.clicks += clicks;
    agg.spend += spend;
    agg.leads += leads;
    if (row.ctr != null) {
      agg.ctrSum += ctr;
      agg.ctrCount += 1;
    } else if (impressions > 0) {
      agg.ctrSum += (clicks / impressions) * 100;
      agg.ctrCount += 1;
    }
  }
  return Array.from(byAd.values()).map((a) => ({
    ...a,
    ctr: a.ctrCount > 0 ? a.ctrSum / a.ctrCount : (a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0),
  }));
}

function computeFatigueScore(frequency, ctrDropPct, cplIncreasePct) {
  let score = 0;
  if (frequency > 3) score += 30;
  if (ctrDropPct > 25) score += 30;
  if (cplIncreasePct > 30) score += 40;
  return score;
}

function getFatigueStatus(score) {
  if (score >= 60) return 'Fatigued';
  if (score >= 40) return 'Warning';
  return 'Healthy';
}

/**
 * Run creative fatigue analysis for date range (default last 7d vs previous 7d).
 */
async function runFatigueAnalysis(opts = {}) {
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
    return { success: false, error: e.message, creatives: [], summary: {} };
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
      if (credentials.adAccountId) accounts = [{ account_id: credentials.adAccountId, name: 'Default' }];
    }
  }
  if (accounts.length === 0) {
    return { success: false, error: 'No ad accounts available', creatives: [], summary: {} };
  }

  const accessToken = credentials.accessToken;
  const allCreatives = [];

  for (const acc of accounts) {
    const accId = acc.account_id || acc.id;
    if (!accId) continue;
    let currentRows = [];
    let previousRows = [];
    try {
      currentRows = await fetchAdInsights(accId, accessToken, fromDate, toDate);
      previousRows = await fetchAdInsights(accId, accessToken, prevFrom, prevTo);
    } catch (err) {
      console.error('[creativeFatigueService] Meta API error for account', accId, err.message);
      continue;
    }

    const currentAgg = aggregateByAd(currentRows);
    const previousAgg = new Map(aggregateByAd(previousRows).map((c) => [c.ad_id, c]));

    for (const cur of currentAgg) {
      const prev = previousAgg.get(cur.ad_id) || {};
      const reach = cur.reach || 0;
      const frequency = reach > 0 ? cur.impressions / reach : 0;
      const ctrCur = cur.ctr ?? 0;
      const ctrPrev = prev.ctr ?? 0;
      const leadsCur = cur.leads || 0;
      const spendCur = cur.spend || 0;
      const cplCur = leadsCur > 0 ? spendCur / leadsCur : 0;
      const leadsPrev = prev.leads || 0;
      const spendPrev = prev.spend || 0;
      const cplPrev = leadsPrev > 0 ? spendPrev / leadsPrev : 0;

      let ctrDropPct = 0;
      if (ctrPrev > 0 && ctrCur < ctrPrev) {
        ctrDropPct = ((ctrPrev - ctrCur) / ctrPrev) * 100;
      }
      let cplIncreasePct = 0;
      if (cplPrev > 0 && cplCur > cplPrev) {
        cplIncreasePct = ((cplCur - cplPrev) / cplPrev) * 100;
      }
      const score = computeFatigueScore(frequency, ctrDropPct, cplIncreasePct);
      const status = getFatigueStatus(score);

      const row = {
        ad_id: cur.ad_id,
        ad_name: cur.ad_name,
        campaign_id: cur.campaign_id,
        campaign_name: cur.campaign_name,
        ad_account_id: accId,
        frequency: Math.round(frequency * 100) / 100,
        ctr: Math.round(ctrCur * 100) / 100,
        cpl: Math.round(cplCur * 100) / 100,
        ctr_drop_pct: Math.round(ctrDropPct * 100) / 100,
        cpl_increase_pct: Math.round(cplIncreasePct * 100) / 100,
        score,
        status,
        period_from: fromDate,
        period_to: toDate,
      };
      allCreatives.push(row);
    }
  }

  if (supabase) {
    const toInsert = allCreatives.map((r) => ({
      ad_id: r.ad_id,
      ad_name: r.ad_name,
      campaign_id: r.campaign_id,
      campaign_name: r.campaign_name,
      ad_account_id: r.ad_account_id,
      frequency: r.frequency,
      ctr: r.ctr,
      cpl: r.cpl,
      ctr_drop_pct: r.ctr_drop_pct,
      cpl_increase_pct: r.cpl_increase_pct,
      score: r.score,
      status: r.status,
      period_from: r.period_from,
      period_to: r.period_to,
    }));
    if (toInsert.length > 0) {
      await supabase.from('creative_fatigue_log').insert(toInsert).then(({ error }) => {
        if (error) console.error('[creativeFatigueService] Log insert error:', error.message);
      });
    }
  }

  const fatigued = allCreatives.filter((c) => c.status === 'Fatigued');
  const warning = allCreatives.filter((c) => c.status === 'Warning');
  const summary = {
    total: allCreatives.length,
    fatigued: fatigued.length,
    warning: warning.length,
    healthy: allCreatives.length - fatigued.length - warning.length,
    period_from: fromDate,
    period_to: toDate,
  };

  return {
    success: true,
    creatives: allCreatives,
    summary,
  };
}

module.exports = {
  runFatigueAnalysis,
  fetchAdInsights,
  aggregateByAd,
  computeFatigueScore,
  getFatigueStatus,
};
