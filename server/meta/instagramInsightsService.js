/**
 * Instagram Business Account Insights Service
 *
 * Fetches insights for multiple Instagram Business Accounts via Meta Graph API v24.0.
 * - Accepts dynamic array of IG Business Account IDs (from DB or resolved from pages)
 * - Supports time range filters (7 days, 30 days, custom)
 * - Handles partial failures (one account fails, others still load)
 * - Rate-limit safe (uses schedule for concurrent control)
 *
 * Two request formats are used per account:
 * 1) Reached / Follows: GET .../{IG_USER_ID}/insights?metric=reach,follower_count&period=day&since=&until=
 * 2) Views / Interactions: GET .../{IG_USER_ID}/insights?metric=views,total_interactions&metric_type=total_value&period=day&since=&until=
 */

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const META_API_VERSION = process.env.META_IG_API_VERSION || "v24.0";
const rateLimiter = require("../services/meta/rateLimiter");

function getAccessToken() {
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
 * Resolve IG account IDs via instagram_accounts edge (requires Page access token).
 * GET /{page_id}/instagram_accounts returns { data: [{ id }] }
 * Matches Meta Graph API Explorer flow when using Page token.
 *
 * @param {string[]} pageIds - Facebook Page IDs
 * @param {(pageId: string) => Promise<string>} getPageTokenFn - Async function to get Page access token
 * @returns {Promise<{ accountIds: string[], pageToken?: string }>} IG IDs and first Page token for insights
 */
async function resolveIgAccountsViaInstagramAccountsEdge(pageIds, getPageTokenFn) {
  if (!pageIds || pageIds.length === 0) return { accountIds: [], pageToken: undefined };
  if (typeof getPageTokenFn !== "function") return { accountIds: [], pageToken: undefined };

  const seen = new Set();
  let firstPageToken = null;

  for (const pageId of pageIds) {
    try {
      const pageToken = await getPageTokenFn(pageId);
      if (!pageToken) continue;
      if (!firstPageToken) firstPageToken = pageToken;

      const url = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/instagram_accounts`;
      const { data } = await rateLimiter.schedule(() =>
        axios.get(url, {
          params: { access_token: pageToken },
          timeout: 15000,
        })
      );

      const items = data?.data;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item?.id) seen.add(String(item.id));
        }
      }
    } catch (err) {
      console.warn(
        `[Instagram Insights] instagram_accounts edge failed for page ${pageId}:`,
        err?.response?.data?.error?.message || err.message
      );
    }
  }

  return { accountIds: Array.from(seen), pageToken: firstPageToken || undefined };
}

/**
 * Resolve Instagram Business Account IDs from Facebook Page IDs (fallback).
 * GET /{page-id}?fields=instagram_business_account
 *
 * @param {string[]} pageIds - Facebook Page IDs
 * @param {string} accessToken - System/User token
 * @returns {Promise<string[]>} Array of IG Business Account IDs (unique)
 */
async function resolveIgAccountsFromPages(pageIds, accessToken) {
  if (!pageIds || pageIds.length === 0) return [];

  const baseUrl = `https://graph.facebook.com/${META_API_VERSION}`;
  const seen = new Set();

  const results = await Promise.allSettled(
    pageIds.map((pageId) =>
      rateLimiter.schedule(() =>
        axios.get(`${baseUrl}/${pageId}`, {
          params: {
            fields: "instagram_business_account",
            access_token: accessToken,
          },
          timeout: 15000,
        })
      )
    )
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.data?.instagram_business_account?.id) {
      seen.add(String(result.value.data.instagram_business_account.id));
    }
  }

  return Array.from(seen);
}

/**
 * Extract numeric value from Meta API response. Handles both time_series (values array)
 * and total_value response formats per Meta docs.
 */
function extractMetricValue(m) {
  const values = m.values || [];
  const totalVal = m.total_value;
  const totalValue =
    totalVal != null
      ? typeof totalVal === "number"
        ? totalVal
        : totalVal?.value
      : null;
  if (totalValue != null) return Number(totalValue) || 0;
  let sum = 0;
  for (const v of values) {
    sum += Number(v?.value) || 0;
  }
  return sum;
}

/**
 * Compute total_follows and total_unfollows from follower_count daily deltas.
 * Unfollows are estimated using follower_count deltas because Instagram Graph API
 * does not expose daily unfollow metrics.
 *
 * @param {{ name: string, values: Array<{ value: number, end_time: string }> }} followerCountMetric
 * @returns {{ total_follows: number, total_unfollows: number, net_followers: number, date_range_days: number }}
 */
function computeUnfollowsFromFollowerCountDeltas(followerCountMetric) {
  const values = followerCountMetric?.values || [];
  if (values.length < 2) {
    return { total_follows: 0, total_unfollows: 0, net_followers: 0, date_range_days: values.length };
  }
  const sorted = [...values]
    .filter((v) => v && (v.value != null) && v.end_time)
    .map((v) => ({ value: Number(v.value) || 0, date: (v.end_time || "").split("T")[0] }))
    .sort((a, b) => a.date.localeCompare(b.date));
  let totalFollows = 0;
  let totalUnfollows = 0;
  for (let i = 1; i < sorted.length; i++) {
    const dailyChange = sorted[i].value - sorted[i - 1].value;
    if (dailyChange > 0) totalFollows += dailyChange;
    else if (dailyChange < 0) totalUnfollows += Math.abs(dailyChange);
  }
  return {
    total_follows: totalFollows,
    total_unfollows: totalUnfollows,
    net_followers: totalFollows - totalUnfollows,
    date_range_days: sorted.length,
  };
}

/**
 * Normalize a single account's Meta API response into our format.
 * Handles both values (time_series) and total_value response shapes.
 *
 * @param {string} accountId
 * @param {object[]} data - Meta API response data array
 * @param {string} date - YYYY-MM-DD
 * @returns {{ accountId, reached, follows, views, interactions, date }}
 */
function normalizeAccountResponse(accountId, data, date) {
  const out = {
    accountId,
    reached: 0,
    follows: 0,
    views: 0,
    interactions: 0,
    total_follows_delta: 0,
    total_unfollows: 0,
    net_followers_delta: 0,
    date_range_days: 0,
    date: date || new Date().toISOString().slice(0, 10),
  };

  if (!Array.isArray(data)) return out;

  for (const m of data) {
    const name = m.name;
    const values = m.values || [];
    const totalValue = m.total_value?.value ?? (typeof m.total_value === "number" ? m.total_value : null);

    if (name === "follower_count") {
      const latest = values.length > 0 ? values[values.length - 1] : null;
      out.follows = latest ? Number(latest.value) || 0 : totalValue != null ? Number(totalValue) : 0;
      const deltaResult = computeUnfollowsFromFollowerCountDeltas(m);
      out.total_follows_delta = deltaResult.total_follows;
      out.total_unfollows = deltaResult.total_unfollows;
      out.net_followers_delta = deltaResult.net_followers;
      out.date_range_days = deltaResult.date_range_days;
      continue;
    }

    const sum = extractMetricValue(m);
    switch (name) {
      case "reach":
        out.reached = sum;
        break;
      case "views":
        out.views = sum;
        break;
      case "impressions":
        if (out.views === 0) out.views = sum;
        break;
      case "total_interactions":
        out.interactions = sum;
        break;
      case "profile_views":
        if (out.interactions === 0) out.interactions = sum;
        break;
      default:
        break;
    }
  }

  return out;
}

/**
 * Convert YYYY-MM-DD date string to Unix timestamp (seconds).
 * Meta Instagram insights API requires Unix timestamps for since/until.
 */
function dateToUnix(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor(d.getTime() / 1000);
}

/**
 * Call Instagram insights API for one set of metrics (optional metric_type).
 *
 * @param {string} igAccountId
 * @param {string} since - YYYY-MM-DD
 * @param {string} until - YYYY-MM-DD
 * @param {string} accessToken
 * @param {string} metrics - e.g. "reach,follower_count" or "views,total_interactions"
 * @param {string} [metricType] - e.g. "total_value" for views/total_interactions
 * @returns {Promise<object[] | null>} Meta API data array or null on error
 */
async function fetchInsightsRequest(igAccountId, since, until, accessToken, metrics, metricType) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/insights`;
  const sinceUnix = dateToUnix(since);
  const untilUnix = dateToUnix(until);

  const params = {
    metric: metrics,
    period: "day",
    ...(metricType && { metric_type: metricType }),
    ...(sinceUnix != null && { since: sinceUnix }),
    ...(untilUnix != null && { until: untilUnix }),
    access_token: accessToken,
  };

  console.log("[Instagram Insights] Meta API call:", {
    igAccountId,
    metric: params.metric,
    metric_type: params.metric_type || "(none)",
    period: params.period,
  });

  try {
    const { data } = await axios.get(url, { params, timeout: 20000 });
    const rawData = data?.data || [];
    if (rawData.length > 0) {
      console.log("[Instagram Insights] Response metrics for account", igAccountId, ":", rawData.map((m) => m.name));
    }
    return rawData;
  } catch (err) {
    const code = err?.response?.data?.error?.code;
    const msg = err?.response?.data?.error?.message || err.message;
    console.error("[Instagram Insights] Meta API error for account", igAccountId, ":", { code, message: msg });
    return null;
  }
}

/**
 * Fetch insights for a single IG Business Account.
 * Uses two requests to match required formats:
 * - Reached/Follows: metric=reach,follower_count&period=day
 * - Views/Interactions: metric=views,total_interactions&metric_type=total_value&period=day
 *
 * @param {string} igAccountId
 * @param {string} since - YYYY-MM-DD (converted to Unix for Meta API)
 * @param {string} until - YYYY-MM-DD (converted to Unix for Meta API)
 * @param {string} accessToken
 * @returns {Promise<{ accountId, reached, follows, views, interactions, date } | null>}
 */
async function fetchSingleAccountInsights(igAccountId, since, until, accessToken) {
  const [reachData, viewsData] = await Promise.all([
    fetchInsightsRequest(igAccountId, since, until, accessToken, "reach,follower_count"),
    fetchInsightsRequest(igAccountId, since, until, accessToken, "views,total_interactions", "total_value"),
  ]);

  const mergedData = [
    ...(Array.isArray(reachData) ? reachData : []),
    ...(Array.isArray(viewsData) ? viewsData : []),
  ];

  if (mergedData.length === 0) {
    console.warn("[Instagram Insights] No data returned for account", igAccountId);
    return null;
  }

  return normalizeAccountResponse(igAccountId, mergedData, until);
}

/**
 * Compute date range from period preset.
 * @param {string} period - 'last_7_days' | 'last_30_days'
 * @returns {{ since: string, until: string }}
 */
function getDateRangeFromPeriod(period) {
  const today = new Date();
  const until = new Date(today);
  until.setDate(until.getDate() - 1); // Yesterday (Meta often excludes today)
  const start = new Date(until);

  if (period === "last_30_days") {
    start.setDate(start.getDate() - 29);
  } else {
    start.setDate(start.getDate() - 6); // last_7_days
  }

  return {
    since: start.toISOString().slice(0, 10),
    until: until.toISOString().slice(0, 10),
  };
}

/**
 * Aggregate normalized account data for dashboard.
 *
 * @param {Array<{ accountId, reached, follows, views, interactions }>} accounts
 * @returns {object}
 */
function aggregateAccounts(accounts) {
  const valid = accounts.filter(Boolean);
  const totalReached = valid.reduce((s, a) => s + (a.reached || 0), 0);
  const totalFollows = valid.reduce((s, a) => s + (a.follows || 0), 0);
  const totalViews = valid.reduce((s, a) => s + (a.views || 0), 0);
  const totalInteractions = valid.reduce((s, a) => s + (a.interactions || 0), 0);
  const totalUnfollows = valid.reduce((s, a) => s + (a.total_unfollows || 0), 0);
  const totalFollowsDelta = valid.reduce((s, a) => s + (a.total_follows_delta || 0), 0);
  const netFollowersDelta = totalFollowsDelta - totalUnfollows;
  const dateRangeDaysArr = valid.map((a) => a.date_range_days || 0);
  const maxDateRangeDays = dateRangeDaysArr.length > 0 ? Math.max(0, ...dateRangeDaysArr) : 0;

  return {
    totalReached,
    totalFollows,
    totalViews,
    totalInteractions,
    totalUnfollows,
    totalFollowsDelta,
    netFollowersDelta,
    date_range_days: maxDateRangeDays,
    accounts: valid.map((a) => ({
      accountId: a.accountId,
      reached: a.reached || 0,
      follows: a.follows || 0,
      views: a.views || 0,
      interactions: a.interactions || 0,
      total_unfollows: a.total_unfollows || 0,
      total_follows_delta: a.total_follows_delta || 0,
    })),
  };
}

/**
 * Fetch insights for multiple IG Business Accounts.
 * Uses rate limiter to avoid Meta "too many API calls".
 * When pageIds + getPageToken provided: tries instagram_accounts edge with Page token first, then uses Page token for insights.
 *
 * @param {object} opts
 * @param {string[]} [opts.accountIds] - Direct IG Business Account IDs
 * @param {string[]} [opts.pageIds] - Resolve IG IDs from these Page IDs
 * @param {(pageId: string) => Promise<string>} [opts.getPageToken] - Async fn to get Page access token (for instagram_accounts edge)
 * @param {string} [opts.from] - YYYY-MM-DD
 * @param {string} [opts.to] - YYYY-MM-DD
 * @param {string} [opts.period] - 'last_7_days' | 'last_30_days' (used if from/to not set)
 * @returns {Promise<object>} Dashboard-ready structure
 */
async function fetchInstagramInsights(opts = {}) {
  console.log("[Instagram Insights] Service called with params:", {
    pageIds: opts.pageIds,
    accountIds: opts.accountIds,
    from: opts.from,
    to: opts.to,
    period: opts.period,
    hasGetPageToken: typeof opts.getPageToken === "function",
  });

  const systemToken = getAccessToken();
  let accountIds = opts.accountIds && opts.accountIds.length > 0
    ? [...opts.accountIds]
    : [];
  let insightsToken = systemToken;

  if (accountIds.length === 0 && opts.pageIds && opts.pageIds.length > 0) {
    if (typeof opts.getPageToken === "function") {
      const edgeResult = await resolveIgAccountsViaInstagramAccountsEdge(opts.pageIds, opts.getPageToken);
      accountIds = edgeResult.accountIds;
      if (edgeResult.pageToken) insightsToken = edgeResult.pageToken;
    }
    if (accountIds.length === 0) {
      accountIds = await resolveIgAccountsFromPages(opts.pageIds, systemToken);
    }
  }

  // When pageIds were provided, always use a Page access token for Instagram insights (Meta requirement)
  if (
    accountIds.length > 0 &&
    typeof opts.getPageToken === "function" &&
    opts.pageIds &&
    opts.pageIds.length > 0
  ) {
    if (insightsToken === systemToken) {
      for (const pageId of opts.pageIds) {
        const pageToken = await opts.getPageToken(pageId);
        if (pageToken) {
          insightsToken = pageToken;
          break;
        }
      }
    }
    if (insightsToken === systemToken) {
      console.warn("[Instagram Insights] Page access token required but could not be obtained for any page. Call GET /api/meta/pages first.");
      return {
        totalReached: 0,
        totalFollows: 0,
        totalViews: 0,
        totalInteractions: 0,
        accounts: [],
        data: null,
        error: "Page access token required for Instagram insights but could not be obtained. Ensure GET /api/meta/pages is called first so page tokens are available.",
      };
    }
  }

  if (accountIds.length === 0) {
    console.warn(
      "[Instagram Insights] No IG accounts resolved. Provide accountIds or pageIds with linked Instagram Business accounts."
    );
    return {
      totalReached: 0,
      totalFollows: 0,
      totalViews: 0,
      totalInteractions: 0,
      accounts: [],
      data: null,
      error: "No Instagram Business Account IDs to fetch. Provide accountIds or pageIds.",
    };
  }

  let since = opts.from;
  let until = opts.to;
  if (!since || !until) {
    const range = getDateRangeFromPeriod(opts.period || "last_7_days");
    since = range.since;
    until = range.until;
  }

  const tokenType = insightsToken === systemToken ? "system" : "page";
  console.log("[Instagram Insights] Token type for Meta API call:", tokenType);

  const results = await Promise.all(
    accountIds.map((id) =>
      rateLimiter.schedule(() =>
        fetchSingleAccountInsights(id, since, until, insightsToken)
      )
    )
  );

  const aggregated = aggregateAccounts(results);
  const date = until;

  const validCount = results.filter(Boolean).length;
  if (validCount === 0 && results.length > 0) {
    console.warn(
      "[Instagram Insights] All account fetches failed for",
      accountIds.length,
      "account(s). Check token permissions (instagram_manage_insights) and IG account linkage."
    );
  }

  const response = {
    ...aggregated,
    total_unfollows: aggregated.totalUnfollows,
    date,
    since,
    until,
    data: {
      total_views: aggregated.totalViews,
      total_interactions: aggregated.totalInteractions,
      total_follows: aggregated.totalFollows,
      total_reached: aggregated.totalReached,
      total_unfollows: aggregated.totalUnfollows,
      viewsChange: 0,
      interactionsChange: 0,
      followsChange: 0,
      reachChange: 0,
      unfollowsChange: 0,
      date_range_days: aggregated.date_range_days,
      period: `${since} to ${until}`,
    },
    error: null,
  };
  console.log("[Instagram Insights] Service response:", {
    accountCount: accountIds.length,
    totalReached: response.totalReached,
    totalFollows: response.totalFollows,
    totalViews: response.totalViews,
    totalInteractions: response.totalInteractions,
    totalUnfollows: response.totalUnfollows,
  });
  return response;
}

module.exports = {
  fetchInstagramInsights,
  resolveIgAccountsFromPages,
  resolveIgAccountsViaInstagramAccountsEdge,
  normalizeAccountResponse,
  aggregateAccounts,
  getDateRangeFromPeriod,
  computeUnfollowsFromFollowerCountDeltas,
};
