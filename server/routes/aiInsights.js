/**
 * AI Insights API – uses Google Gemini 2.x to generate marketing insights and recommendations.
 * Requires GOOGLE_GEMINI_API_KEY in server .env.
 * Optional: GEMINI_MODEL (default gemini-2.5-flash; e.g. gemini-2.5-pro for higher quality).
 */

const express = require('express');
const axios = require('axios');

const router = express.Router();
const GEMINI_API_KEY = process.env.GOOGLE_GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `You are a marketing analytics AI. Generate a single JSON object for a marketing dashboard "AI Insights" page. Use realistic but varied numbers and campaign names. Return ONLY valid JSON, no markdown or explanation.

Required JSON shape (use these exact keys):

{
  "adsData": {
    "lastMonth": { "name": "string", "platform": "Meta or Website", "spend": number, "leads": number, "cpl": number (2 decimals), "reason": "1-2 sentence insight", "action": "SCALE" or "MONITOR" or "PAUSE" },
    "lastWeek": { ... same shape },
    "thisWeek": { ... same shape },
    "today": { ... same shape }
  },
  "reelsData": {
    "lastMonth": { "name": "string", "platform": "Instagram or Facebook", "reach": number, "engagements": number, "saves": number, "reason": "1-2 sentence insight", "action": "REPURPOSE" or "BOOST" or "MONITOR" },
    "lastWeek": { ... same shape },
    "thisWeek": { ... same shape },
    "today": { ... same shape }
  },
  "insights": [
    { "id": 1, "type": "string e.g. AD PERFORMANCE", "timeWindow": "Last Week or This Week or Today or Last Month", "category": "success" or "warning" or "info", "text": "1-2 sentence insight", "action": "→ Short action phrase" }
  ],
  "recommendations": [
    { "id": 1, "title": "string", "icon": "single emoji", "color": "green" or "red" or "blue" or "purple", "justification": "1-2 sentence data-driven reason" }
  ]
}

Rules: Include exactly 6 items in "insights" and 4 in "recommendations". ids 1-based. Actions in adsData/reelsData must be one of the allowed values. Generate diverse, actionable content.`;

const PROMPT_WITH_REAL_DATA = (bestAd, bestReel, dateRange) => `You are a marketing analytics AI. Below is REAL performance data from the user's Best Performing Ad and Best Performing Reel (from Meta/Instagram). Generate insights and recommendations based ONLY on this data. Return ONLY valid JSON, no markdown or explanation.

Real data:
- Best Performing Ad: ${JSON.stringify(bestAd || 'none')}
- Best Performing Reel: ${JSON.stringify(bestReel || 'none')}
- Date range: ${dateRange ? `${dateRange.from} to ${dateRange.to}` : 'not specified'}

Return a single JSON object with exactly these keys:
{
  "insights": [
    { "id": 1, "type": "string e.g. AD PERFORMANCE", "timeWindow": "Last Week or This Week or Today or Last Month", "category": "success" or "warning" or "info", "text": "1-2 sentence insight based on the real data above", "action": "→ Short action phrase" }
  ],
  "recommendations": [
    { "id": 1, "title": "string", "icon": "single emoji", "color": "green" or "red" or "blue" or "purple", "justification": "1-2 sentence data-driven reason using the real metrics" }
  ]
}

Rules: Include exactly 6 items in "insights" and 4 in "recommendations". ids 1-based. Base every insight and recommendation on the actual campaign names, spend, leads, CPL, reach, engagements, and saves provided. Be specific (mention numbers or names where relevant).`;

/**
 * POST /api/ai/insights
 * Body: { bestAd?, bestReel?, bestAds?: { lastMonth, lastWeek, thisWeek, today }, bestReels?: { ... }, dateRange?: { from, to } }
 * When bestAds/bestReels (per period) are provided, server builds adsData/reelsData from them.
 * Otherwise falls back to single bestAd/bestReel or full AI-generated data.
 */
router.post('/insights', async (req, res) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === '') {
    return res.status(503).json({
      success: false,
      error: 'AI insights not configured',
      details: 'Add GOOGLE_GEMINI_API_KEY to server .env'
    });
  }

  const { bestAd, bestReel, bestAds, bestReels, dateRange } = req.body || {};
  const hasPerPeriod = bestAds && typeof bestAds === 'object' && (Object.keys(bestAds).length > 0);
  const useRealData = hasPerPeriod || (bestAd && typeof bestAd === 'object') || (bestReel && typeof bestReel === 'object');

  try {
    let prompt = PROMPT;
    if (useRealData) {
      const adForPrompt = hasPerPeriod ? bestAds.lastWeek || bestAds.thisWeek || bestAds.lastMonth : bestAd;
      const reelForPrompt = hasPerPeriod ? bestReels.lastWeek || bestReels.thisWeek || bestReels.lastMonth : bestReel;
      prompt = PROMPT_WITH_REAL_DATA(adForPrompt, reelForPrompt, dateRange);
    }

    const response = await axios.post(
      `${GEMINI_URL}?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.6,
          maxOutputTokens: 8192
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    let text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const reason = response.data?.candidates?.[0]?.finishReason || 'No content';
      return res.status(502).json({
        success: false,
        error: 'AI returned no content',
        details: reason
      });
    }

    text = text.trim();
    const jsonMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (jsonMatch) text = jsonMatch[1].trim();
    const parsed = JSON.parse(text);

    let adsData = parsed.adsData || {};
    let reelsData = parsed.reelsData || {};
    let insights = Array.isArray(parsed.insights) ? parsed.insights : [];
    let recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    if (useRealData) {
      reelsData = {};
      adsData = {};
      const timeKeys = ['lastMonth', 'lastWeek', 'thisWeek', 'today'];
      if (hasPerPeriod) {
        timeKeys.forEach((k) => {
          adsData[k] = buildAdSlotFromReal(bestAds[k]);
          reelsData[k] = buildReelSlotFromReal(bestReels[k]);
        });
      } else {
        const adSlot = buildAdSlotFromReal(bestAd);
        const reelSlot = buildReelSlotFromReal(bestReel);
        timeKeys.forEach((k) => {
          adsData[k] = adSlot;
          reelsData[k] = reelSlot;
        });
      }
    }

    return res.json({
      success: true,
      data: {
        adsData: ensureTimeWindows(adsData, 'ads'),
        reelsData: ensureTimeWindows(reelsData, 'reels'),
        insights: insights.slice(0, 6),
        recommendations: recommendations.slice(0, 4)
      }
    });
  } catch (err) {
    const status = err.response?.status === 400 ? 400 : err.response?.status === 429 ? 429 : 500;
    const message = err.response?.data?.error?.message || err.message || 'AI request failed';
    console.error('[AI Insights] Gemini error:', message);
    return res.status(status).json({
      success: false,
      error: 'AI insights request failed',
      details: message
    });
  }
});

function buildAdSlotFromReal(bestAd) {
  if (!bestAd || typeof bestAd !== 'object') {
    return { name: '—', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'No ad data.', action: 'MONITOR' };
  }
  const spend = Number(bestAd.spend) || 0;
  const leads = Number(bestAd.leads) || 0;
  const cpl = leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0;
  const name = bestAd.name || bestAd.campaignName || bestAd.ad_name || 'Campaign';
  const platform = bestAd.platform || bestAd.ad_account_name ? 'Meta' : 'Meta';
  const reason = bestAd.reason || `Best performer in selected period: ${leads} leads at $${cpl.toFixed(2)} CPL.`;
  return {
    name: String(name).slice(0, 120),
    platform: String(platform).slice(0, 32),
    spend,
    leads,
    cpl,
    reason: String(reason).slice(0, 400),
    action: bestAd.action === 'PAUSE' || bestAd.action === 'SCALE' ? bestAd.action : 'MONITOR'
  };
}

function buildReelSlotFromReal(bestReel) {
  if (!bestReel || typeof bestReel !== 'object') {
    return { name: '—', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'No reel data.', action: 'MONITOR' };
  }
  const reach = Number(bestReel.reach) || 0;
  const engagements = Number(bestReel.engagements) || Number(bestReel.total_interactions) || 0;
  const saves = Number(bestReel.saves) || 0;
  const name = bestReel.name || (bestReel.caption && bestReel.caption.slice(0, 60)) || 'Reel';
  const platform = bestReel.platform || 'Instagram';
  const reason = bestReel.reason || `Top content: ${(reach / 1000).toFixed(0)}K reach, ${engagements} engagements.`;
  return {
    name: String(name).slice(0, 120),
    platform: String(platform).slice(0, 32),
    reach,
    engagements,
    saves,
    reason: String(reason).slice(0, 400),
    action: bestReel.action === 'REPURPOSE' || bestReel.action === 'BOOST' ? bestReel.action : 'MONITOR'
  };
}

/** Ensure lastMonth, lastWeek, thisWeek, today exist with valid shape so UI does not break */
function ensureTimeWindows(obj, type) {
  const defaults = type === 'ads'
    ? { name: 'Campaign', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'No data.', action: 'MONITOR' }
    : { name: 'Reel', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'No data.', action: 'MONITOR' };
  const keys = ['lastMonth', 'lastWeek', 'thisWeek', 'today'];
  const out = {};
  for (const k of keys) {
    const v = obj[k];
    out[k] = v && typeof v === 'object' ? { ...defaults, ...v } : { ...defaults };
  }
  return out;
}

module.exports = router;
