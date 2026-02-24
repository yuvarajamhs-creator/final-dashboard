/**
 * Video Performance Service — fetches ad-level insights from Meta Ads API,
 * extracts video action metrics, and returns Hook Rate and Hold Rate per ad.
 * Used by GET /api/meta/video-performance.
 */

const axios = require("axios");

const META_API_VERSION = "v24.0";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map();

function normalizeAdAccountId(id) {
  if (!id || typeof id !== "string") return "";
  const stripped = String(id).trim().replace(/^act_/, "");
  return stripped ? `act_${stripped}` : "";
}

function getActionValue(actionsArray, type) {
  if (!Array.isArray(actionsArray)) return 0;
  const entry = actionsArray.find((a) => a && a.action_type === type);
  if (!entry || entry.value == null) return 0;
  const n = Number(entry.value);
  return Number.isFinite(n) ? n : 0;
}

async function fetchVideoPerformanceFromMeta(adAccountId, accessToken, since, until) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${adAccountId}/insights`;
  const params = {
    access_token: accessToken,
    level: "ad",
    fields: "ad_id,ad_name,impressions,actions,action_values",
    limit: 1000,
  };
  if (since && until) {
    params.time_range = JSON.stringify({ since, until });
  } else {
    params.date_preset = "last_7d";
  }

  let allRows = [];
  let currentParams = { ...params };
  let pageCount = 0;
  const maxPages = 20;

  do {
    const res = await axios.get(url, { params: currentParams, timeout: 60000 });
    const data = res.data;
    const chunk = Array.isArray(data.data) ? data.data : [];
    allRows = allRows.concat(chunk);

    const nextUrl = data.paging && data.paging.next;
    if (nextUrl && pageCount < maxPages) {
      const u = new URL(data.paging.next);
      currentParams = { ...params, after: u.searchParams.get("after") };
      pageCount++;
    } else {
      break;
    }
  } while (true);

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  return allRows.map((row) => {
    const impressions = Number(row.impressions) || 0;
    const plays =
      getActionValue(row.actions, "video_play") || getActionValue(row.actions, "video_view");
    const videoPlay = getActionValue(row.actions, "video_play");
    const p100Watched =
      getActionValue(row.action_values, "video_p100_watched_actions") ||
      getActionValue(row.actions, "video_p100_watched_actions");
    let hookRate = impressions > 0 ? (plays / impressions) * 100 : 0;
    let holdRate = videoPlay > 0 ? (p100Watched / videoPlay) * 100 : 0;
    hookRate = Math.round(hookRate * 100) / 100;
    holdRate = Math.round(holdRate * 100) / 100;
    return {
      adName: row.ad_name || "Unnamed",
      impressions,
      plays,
      completedViews: p100Watched,
      hookRate,
      holdRate,
    };
  });
}

async function fetchVideoPerformance(adAccountId, accessToken, since, until) {
  const normalizedId = normalizeAdAccountId(adAccountId);
  if (!normalizedId) {
    throw Object.assign(new Error("adAccountId is required"), { statusCode: 400 });
  }
  if (!accessToken || !String(accessToken).trim()) {
    throw Object.assign(
      new Error("accessToken is required (query param or META_ACCESS_TOKEN in server .env)"),
      { statusCode: 400 }
    );
  }

  const cacheKey = `video_perf:${normalizedId}:${since || ""}:${until || ""}`;
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && hit.expires > now) {
    return hit.data;
  }

  try {
    const data = await fetchVideoPerformanceFromMeta(normalizedId, accessToken, since, until);
    cache.set(cacheKey, { data, expires: now + CACHE_TTL_MS });
    return data;
  } catch (err) {
    if (err.response && err.response.data && err.response.data.error) {
      const metaError = err.response.data.error;
      const code = metaError.code;
      const msg = metaError.message || err.message;
      if (code === 190 || (msg && msg.toLowerCase().includes("token"))) {
        throw Object.assign(new Error(msg), { statusCode: 401 });
      }
      if (code === 10 || code === 200 || (msg && msg.toLowerCase().includes("permission"))) {
        throw Object.assign(new Error(msg), { statusCode: 403 });
      }
      throw Object.assign(new Error(msg), { statusCode: 502 });
    }
    console.error("[VideoPerformance]", err.message);
    throw Object.assign(new Error(err.message || "Failed to fetch video performance"), {
      statusCode: 500,
    });
  }
}

module.exports = {
  fetchVideoPerformance,
  normalizeAdAccountId,
  getActionValue,
};
