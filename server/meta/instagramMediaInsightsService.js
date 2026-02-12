/**
 * Instagram Media Insights Service (Reel Hook Rate & Hold Rate)
 *
 * Uses Instagram Graph API v24+ to:
 * 1) Fetch media list per IG Business Account (id, media_type, product_type, video_duration)
 * 2) Auto-detect Reels (VIDEO + REELS); retention metrics are ONLY supported for Reels (Meta #100 for feed videos)
 * 3) Conditionally request retention metrics for Reels vs standard metrics for non-Reels (never mix)
 * 4) Compute hook_rate and hold_rate for Reels only; return null + availability for non-Reels
 *
 * All Graph API calls go through an error-safe wrapper and the shared rate limiter.
 */

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const META_API_VERSION = process.env.META_IG_API_VERSION || "v24.0";
const rateLimiter = require("../services/meta/rateLimiter");
const {
  resolveIgAccountsViaInstagramAccountsEdge,
  resolveIgAccountsFromPages,
  getDateRangeFromPeriod,
} = require("./instagramInsightsService");

function getSystemToken() {
  const token = (
    process.env.META_SYSTEM_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN ||
    ""
  ).trim();
  if (!token) {
    throw new Error(
      "Meta credentials missing. Configure META_SYSTEM_ACCESS_TOKEN or META_ACCESS_TOKEN in server/.env"
    );
  }
  return token;
}

/**
 * Error-safe Graph API GET. Catches Meta errors (including #100 invalid metric);
 * never throws metric errors to caller so they never reach the frontend.
 * @param {string} url - Full Graph API URL
 * @param {object} params - Query params (access_token added by caller)
 * @returns {Promise<object|null>} response.data or null on error
 */
async function graphApiGet(url, params) {
  try {
    const { data } = await axios.get(url, {
      params: { ...params },
      timeout: 20000,
    });
    return data;
  } catch (err) {
    const code = err?.response?.data?.error?.code;
    const msg = err?.response?.data?.error?.message || err.message;
    // #100 = invalid parameter/metric; do not propagate to frontend
    if (code === 100) {
      console.warn("[Instagram Media Insights] Meta error #100 (invalid metric) - retention metrics not supported for this media:", msg);
      return null;
    }
    console.warn("[Instagram Media Insights] Graph API error:", { code, message: msg });
    return null;
  }
}

/**
 * Step 1 — Fetch media list for an IG Business Account.
 * GET /{ig_user_id}/media?fields=id,media_type,product_type,video_duration,permalink
 * Handles pagination via next cursor.
 *
 * @param {string} igAccountId - IG Business Account ID
 * @param {string} accessToken - Page or system access token
 * @returns {Promise<Array<{ id, media_type, product_type, video_duration, permalink }>>}
 */
async function fetchMediaList(igAccountId, accessToken) {
  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`;
  const fields = "id,media_type,product_type,video_duration,permalink";
  const limit = 100;
  const all = [];

  let url = baseUrl;
  let params = { fields, limit, access_token: accessToken };

  while (url) {
    const data = await rateLimiter.schedule(() => graphApiGet(url, params));
    if (!data) break;

    const items = data.data || [];
    for (const item of items) {
      all.push({
        id: item.id,
        media_type: item.media_type || null,
        product_type: item.product_type || null,
        video_duration: item.video_duration != null ? Number(item.video_duration) : null,
        permalink: item.permalink || null,
      });
    }

    const nextUrl = data.paging?.next;
    if (!nextUrl || items.length === 0) break;
    url = nextUrl;
    params = {};
  }

  return all;
}

/**
 * Step 2 — Reel detection. Retention metrics (plays, video_views, video_avg_time_watched)
 * are ONLY supported when media_type === "VIDEO" and product_type === "REELS".
 * Requesting them for feed videos causes Meta error #100.
 * Fallback: if product_type is missing, treat as Reel when permalink contains "/reel/".
 *
 * @param {{ media_type?: string, product_type?: string, permalink?: string }} media
 * @returns {boolean}
 */
function isReel(media) {
  if (media.media_type === "VIDEO" && media.product_type === "REELS") return true;
  if (!media.product_type && (media.permalink || "").includes("/reel/")) return true;
  return false;
}

/**
 * Step 4 — Hook rate: (video_views / plays) * 100. Divide-by-zero safe, clamped 0–100, 2 decimals.
 */
function calcHookRate(plays, video_views) {
  if (plays == null || plays <= 0) return 0;
  const rate = (Number(video_views) / Number(plays)) * 100;
  const clamped = Math.min(100, Math.max(0, rate));
  return Math.round(clamped * 100) / 100;
}

/**
 * Step 4 — Hold rate: (video_avg_time_watched / video_duration) * 100. Divide-by-zero safe, clamped 0–100, 2 decimals.
 */
function calcHoldRate(video_avg_time_watched, video_duration) {
  if (video_duration == null || video_duration <= 0) return 0;
  const rate = (Number(video_avg_time_watched) / Number(video_duration)) * 100;
  const clamped = Math.min(100, Math.max(0, rate));
  return Math.round(clamped * 100) / 100;
}

/**
 * Extract numeric value from a Meta insights metric (values array or total_value).
 */
function extractMetricValue(metric) {
  if (!metric) return 0;
  const totalVal = metric.total_value;
  const totalValue =
    totalVal != null
      ? typeof totalVal === "number"
        ? totalVal
        : totalVal?.value
      : null;
  if (totalValue != null) return Number(totalValue) || 0;
  const values = metric.values || [];
  let sum = 0;
  for (const v of values) {
    sum += Number(v?.value) || 0;
  }
  return sum;
}

/**
 * Step 3 — Conditional insights fetch per media. Reels: plays, video_views, video_avg_time_watched.
 * Non-Reels: reach, impressions, likes, comments, saved. Never mix; error-safe.
 *
 * @param {object} media - { id, media_type, product_type, video_duration, permalink }
 * @param {string} accessToken
 * @returns {Promise<{ media_id, media_type, product_type, hook_rate, hold_rate, availability }>}
 */
async function fetchMediaInsights(media, accessToken) {
  const mediaId = media.id;
  const reel = isReel(media);
  const productType = media.product_type || (reel ? "REELS" : "FEED");

  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}/${mediaId}/insights`;

  // Reels: request retention metrics only (avoids #100 for feed videos)
  if (reel) {
    const data = await rateLimiter.schedule(() =>
      graphApiGet(baseUrl, {
        metric: "plays,video_views,video_avg_time_watched",
        access_token: accessToken,
      })
    );

    if (!data || !Array.isArray(data.data)) {
      return {
        media_id: mediaId,
        media_type: media.media_type || "VIDEO",
        product_type: productType,
        hook_rate: null,
        hold_rate: null,
        availability: "not_supported",
      };
    }

    const metrics = {};
    for (const m of data.data) {
      metrics[m.name] = extractMetricValue(m);
    }

    const plays = metrics.plays ?? 0;
    const video_views = metrics.video_views ?? 0;
    const video_avg_time_watched = metrics.video_avg_time_watched ?? 0;
    const video_duration = media.video_duration ?? 0;

    const hook_rate = calcHookRate(plays, video_views);
    const hold_rate = calcHoldRate(video_avg_time_watched, video_duration);

    return {
      media_id: mediaId,
      media_type: media.media_type || "VIDEO",
      product_type: productType,
      hook_rate,
      hold_rate,
      availability: "available",
    };
  }

  // Non-Reels: standard metrics only (never request plays/video_views for feed — causes #100)
  await rateLimiter.schedule(() =>
    graphApiGet(baseUrl, {
      metric: "reach,impressions,likes,comments,saved",
      access_token: accessToken,
    })
  );

  return {
    media_id: mediaId,
    media_type: media.media_type || "VIDEO",
    product_type: productType,
    hook_rate: null,
    hold_rate: null,
    availability: "not_supported",
  };
}

/**
 * Fetch media insights for one IG account: media list then conditional insights per media (parallel, rate-limited).
 *
 * @param {string} igAccountId
 * @param {string} accessToken
 * @returns {Promise<Array<{ media_id, media_type, product_type, hook_rate, hold_rate, availability }>>}
 */
async function fetchAccountMediaInsights(igAccountId, accessToken) {
  const mediaList = await fetchMediaList(igAccountId, accessToken);
  if (mediaList.length === 0) return [];

  const results = await Promise.all(
    mediaList.map((media) => fetchMediaInsights(media, accessToken))
  );

  return results;
}

/**
 * Top-level: fetch Instagram media insights (with Hook Rate & Hold Rate for Reels) for multiple accounts.
 * Resolves IG account IDs and token using the same pattern as instagramInsightsService.
 *
 * @param {object} opts
 * @param {string[]} [opts.accountIds] - Direct IG Business Account IDs
 * @param {string[]} [opts.pageIds] - Resolve IG IDs from these Page IDs
 * @param {(pageId: string) => Promise<string>} [opts.getPageToken] - Page access token getter
 * @param {string} [opts.from] - YYYY-MM-DD (optional; used with to)
 * @param {string} [opts.to] - YYYY-MM-DD (optional)
 * @param {string} [opts.period] - 'last_7_days' | 'last_30_days' (used if from/to not set)
 * @returns {Promise<{ media: array, error?: string, warnings?: string[] }>}
 */
async function fetchInstagramMediaInsights(opts = {}) {
  const systemToken = getSystemToken();
  let accountIds = opts.accountIds && opts.accountIds.length > 0 ? [...opts.accountIds] : [];
  let accessToken = systemToken;

  if (accountIds.length === 0 && opts.pageIds && opts.pageIds.length > 0) {
    if (typeof opts.getPageToken === "function") {
      const edgeResult = await resolveIgAccountsViaInstagramAccountsEdge(
        opts.pageIds,
        opts.getPageToken
      );
      accountIds = edgeResult.accountIds;
      if (edgeResult.pageToken) accessToken = edgeResult.pageToken;
    }
    if (accountIds.length === 0) {
      accountIds = await resolveIgAccountsFromPages(opts.pageIds, systemToken);
    }
  }

  if (opts.pageIds && opts.pageIds.length > 0 && typeof opts.getPageToken === "function" && accessToken === systemToken) {
    for (const pageId of opts.pageIds) {
      const pageToken = await opts.getPageToken(pageId);
      if (pageToken) {
        accessToken = pageToken;
        break;
      }
    }
  }

  if (accountIds.length === 0) {
    return {
      media: [],
      error: "No Instagram Business Account IDs to fetch. Provide accountIds or pageIds.",
    };
  }

  const warnings = [];
  const allMedia = [];

  for (const accountId of accountIds) {
    try {
      const list = await fetchAccountMediaInsights(accountId, accessToken);
      allMedia.push(...list);
    } catch (err) {
      warnings.push(`Account ${accountId}: ${err?.message || err}`);
    }
  }

  return {
    media: allMedia,
    ...(warnings.length > 0 && { warnings }),
  };
}

module.exports = {
  fetchInstagramMediaInsights,
  fetchMediaList,
  fetchMediaInsights,
  fetchAccountMediaInsights,
  isReel,
  calcHookRate,
  calcHoldRate,
  graphApiGet,
};
