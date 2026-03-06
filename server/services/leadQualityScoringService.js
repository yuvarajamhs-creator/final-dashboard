/**
 * Lead Quality Scoring (form/content-only: no lead source, no CRM).
 * Signals: sugar level (from form field_data if available), form completion (full vs partial).
 * Score 0-100; categories: Hot (80-100), Warm (60-80), Average (40-60), Low Intent (0-40).
 */

const { getLeadsByCampaignAndAd, getLeadsByDateRange } = require('../repositories/leadsRepository');
const { supabase } = require('../supabase');

const FORM_FULL_SCORE = 10;
const FORM_PARTIAL_SCORE = 5;
const SUGAR_HIGH = 20;   // > 200
const SUGAR_MID = 15;   // 150-200
const SUGAR_LOW = 10;   // < 150
const SUGAR_MISSING = 10; // neutral when not available
const RAW_MAX = 30;

function getSugarScore(sugarLevel) {
  if (sugarLevel == null || sugarLevel === '') return SUGAR_MISSING;
  const n = Number(sugarLevel);
  if (Number.isNaN(n)) return SUGAR_MISSING;
  if (n > 200) return SUGAR_HIGH;
  if (n >= 150) return SUGAR_MID;
  return SUGAR_LOW;
}

function getFormCompletionScore(lead) {
  const name = (lead.Name ?? lead.name ?? '').toString().trim();
  const phone = (lead.Phone ?? lead.phone ?? '').toString().trim();
  if (name && phone) return FORM_FULL_SCORE;
  return FORM_PARTIAL_SCORE;
}

function getCategory(score100) {
  if (score100 >= 80) return 'Hot Lead';
  if (score100 >= 60) return 'Warm Lead';
  if (score100 >= 40) return 'Average';
  return 'Low Intent';
}

/**
 * Score a single lead (form-only). sugarLevel optional (from field_data when available).
 */
function scoreOneLead(lead, sugarLevel = null) {
  const formScore = getFormCompletionScore(lead);
  const sugarScore = getSugarScore(sugarLevel);
  const raw = formScore + sugarScore;
  const score100 = Math.round((raw / RAW_MAX) * 100);
  const category = getCategory(score100);
  return { score: Math.min(100, Math.max(0, score100)), category, raw, formScore, sugarScore };
}

/**
 * Run scoring for leads in date range (and optional campaign filter). Persist to lead_scores.
 * @param {object} opts - { dateFrom, dateTo, campaignIds? }
 * @returns {Promise<{ success, scored: number, samples: Array<{ lead_id, name, phone, score, category }> }>}
 */
async function runLeadScoring(opts = {}) {
  const { dateFrom, dateTo, campaignIds } = opts || {};
  if (!dateFrom || !dateTo) {
    return { success: false, error: 'dateFrom and dateTo are required', scored: 0, samples: [] };
  }

  let leads = [];
  try {
    if (campaignIds && campaignIds.length > 0) {
      leads = await getLeadsByCampaignAndAd(campaignIds, null, dateFrom, dateTo);
    } else {
      leads = await getLeadsByDateRange(dateFrom, dateTo);
    }
  } catch (e) {
    return { success: false, error: e.message, scored: 0, samples: [] };
  }

  const results = [];
  for (const lead of leads) {
    const sugarLevel = lead.sugar_level ?? lead.sugar_poll ?? null;
    const { score, category } = scoreOneLead(lead, sugarLevel);
    results.push({
      lead_id: lead.lead_id ?? lead.id,
      name: lead.Name ?? lead.name,
      phone: lead.Phone ?? lead.phone,
      campaign_id: lead.campaign_id,
      score,
      category,
    });
  }

  if (supabase && results.length > 0) {
    const toUpsert = results.filter((r) => r.lead_id).map((r) => ({
      lead_id: r.lead_id,
      name: r.name ?? null,
      phone: r.phone ?? null,
      campaign_id: r.campaign_id ?? null,
      sugar_level: null,
      form_completion: r.score >= 67 ? 'full' : 'partial',
      score: r.score,
      category: r.category,
      updated_at: new Date().toISOString(),
    }));
    if (toUpsert.length > 0) {
      await supabase.from('lead_scores').upsert(toUpsert, {
        onConflict: 'lead_id',
        ignoreDuplicates: false,
      }).then(({ error }) => {
        if (error) console.error('[leadQualityScoring] upsert error:', error.message);
      });
    }
  }

  return {
    success: true,
    scored: results.length,
    samples: results.slice(0, 100),
  };
}

/**
 * Get stored lead scores with optional filters.
 */
async function getLeadScores(opts = {}) {
  const { dateFrom, dateTo, campaignId, limit = 200 } = opts || {};
  if (!supabase) return { success: true, data: [] };

  let query = supabase.from('lead_scores').select('id, lead_id, name, phone, campaign_id, score, category, created_at').order('created_at', { ascending: false }).limit(limit);
  if (dateFrom) query = query.gte('created_at', dateFrom + 'T00:00:00');
  if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');
  if (campaignId) query = query.eq('campaign_id', campaignId);

  const { data, error } = await query;
  if (error) throw error;
  return { success: true, data: data || [] };
}

module.exports = {
  scoreOneLead,
  runLeadScoring,
  getLeadScores,
  getCategory,
};
