// meta/meta.jsx
const express = require("express");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { authMiddleware, optionalAuthMiddleware } = require("../auth");
const { saveLeads, getLeadsByCampaignAndAd } = require("../repositories/leadsRepository");
const { fetchLeadsFromMeta } = require("../jobs/leadsSync");

const META_API_VERSION = "v21.0";

// In-memory cache for campaigns and ads
let campaignsCache = {
  data: [],
  lastFetched: null,
  ttl: 5 * 60 * 1000 // 5 minutes
};

let adsCache = {
  data: [],
  lastFetched: null,
  ttl: 5 * 60 * 1000 // 5 minutes
};

// In-memory cache for forms by ad
let formsCache = {
  data: {},
  lastFetched: {},
  ttl: 60 * 1000 // 60 seconds
};

// In-memory cache for pre-loaded leads data (by pageId + date range)
let preloadLeadsCache = {
  data: {},
  lastFetched: {},
  ttl: 5 * 60 * 1000 // 5 minutes
};

// Helper to normalize ad account ID (remove act_ prefix if present)
function normalizeAdAccountId(adAccountId) {
  if (!adAccountId) return adAccountId;
  // Remove act_ prefix if it exists
  return adAccountId.startsWith('act_') ? adAccountId.substring(4) : adAccountId;
}

// Helper to validate and return env credentials
function getCredentials() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !adAccountId) {
    throw new Error("Meta credentials missing. Please configure them in Settings.");
  }
  return {
    accessToken,
    adAccountId: normalizeAdAccountId(adAccountId),
  };
}

// Helper to get system token for leads API (separate from user token)
function getSystemCredentials() {
  const systemToken = process.env.META_SYSTEM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!systemToken || !adAccountId) {
    // Fallback to regular token if system token not configured
    const regularToken = process.env.META_ACCESS_TOKEN;
    if (!regularToken || !adAccountId) {
      throw new Error("Meta credentials missing. Please configure them in Settings.");
    }
    console.log("System token not configured, using regular token for leads API");
    return {
      accessToken: regularToken,
      adAccountId: normalizeAdAccountId(adAccountId),
    };
  }
  console.log("Using system token for leads API");
  return {
    accessToken: systemToken,
    adAccountId: normalizeAdAccountId(adAccountId),
  };
}

// Helper to get system token only (for pages/forms APIs that don't need adAccountId)
function getSystemToken() {
  const systemToken = process.env.META_SYSTEM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    throw new Error("Meta System Access Token missing. Please configure it in Settings.");
  }
  return systemToken;
}

// ---------------------------------------------------------------------
// PAGE ACCESS TOKEN HELPER FUNCTIONS
// ---------------------------------------------------------------------

// In-memory cache for Page Access Tokens
// Meta's leadgen_forms and /leads APIs require a Page Access Token, not a System User Token
// We fetch Page Access Tokens using the System User Token and cache them to avoid repeated API calls
const pageTokenCache = {
  tokens: {}, // pageId -> { token: string, expiresAt: number }
  ttl: 60 * 60 * 1000 // 1 hour TTL
};

/**
 * Get Page Access Token for a specific page
 * 
 * Meta's leadgen_forms and /leads APIs require a Page Access Token, not a System User Token.
 * This function fetches the Page Access Token from Meta API using the System User Token
 * and caches it in memory to avoid repeated API calls.
 * 
 * @param {string} pageId - The Meta page ID
 * @returns {Promise<string>} - The page access token
 */
async function getPageAccessToken(pageId) {
  if (!pageId) {
    throw new Error("Page ID is required to fetch Page Access Token");
  }

  // Check cache first
  const cached = pageTokenCache.tokens[pageId];
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.token;
  }

  // Fetch from Meta API using System User Token
  try {
    const systemToken = getSystemToken();
    const response = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}`,
      {
        params: {
          fields: 'access_token',
          access_token: systemToken
        },
        timeout: 30000
      }
    );

    if (!response.data || !response.data.access_token) {
      throw new Error(`Page access token not found in API response for page ${pageId}`);
    }

    const pageToken = response.data.access_token;

    // Cache the token
    pageTokenCache.tokens[pageId] = {
      token: pageToken,
      expiresAt: now + pageTokenCache.ttl
    };

    return pageToken;
  } catch (error) {
    const errorData = error.response?.data?.error;
    const errorCode = errorData?.code;
    const errorMsg = errorData?.message || error.message;

    // Clear cache on error
    delete pageTokenCache.tokens[pageId];

    // Handle specific error codes
    if (errorCode === 190) {
      throw new Error(`Page Access Token expired/invalid for page ${pageId}: ${errorMsg}. Please check your System User Token.`);
    }
    if (errorCode === 200) {
      throw new Error(`Permission error fetching Page Access Token for page ${pageId}: ${errorMsg}. Ensure your System User Token has 'pages_show_list' permission.`);
    }
    if (errorCode === 10) {
      throw new Error(`Permission denied for page ${pageId}: ${errorMsg}. Check that your System User Token has access to this page.`);
    }

    throw new Error(`Failed to get page access token for page ${pageId}: ${errorMsg}`);
  }
}

// ---------------------------------------------------------------------
// HELPER FUNCTIONS FOR FORM DISCOVERY
// ---------------------------------------------------------------------

// Helper: Extract form_id from creative object_story_spec
function extractFormIdFromCreative(creative) {
  try {
    const spec = creative.object_story_spec;
    if (spec && spec.link_data && spec.link_data.call_to_action) {
      const cta = spec.link_data.call_to_action;
      if (cta.type === 'LEARN_MORE' && cta.value && cta.value.lead_gen_form_id) {
        return cta.value.lead_gen_form_id;
      }
      // Check for other CTA types that might have lead_gen_form_id
      if (cta.value && cta.value.lead_gen_form_id) {
        return cta.value.lead_gen_form_id;
      }
    }
    // Alternative: check video_data for video ads
    if (spec && spec.video_data && spec.video_data.call_to_action) {
      const cta = spec.video_data.call_to_action;
      if (cta.value && cta.value.lead_gen_form_id) {
        return cta.value.lead_gen_form_id;
      }
    }
    // Check page_post_engagement for page posts
    if (spec && spec.page_id) {
      // For page posts, we might need to check the post itself
      // This is a fallback - most lead ads use link_data or video_data
    }
  } catch (err) {
    console.warn('Error extracting form_id from creative:', err.message);
  }
  return null;
}

// Helper: Get lead_gen_form_id from ad creative
async function getFormsFromAds(adIds, accessToken) {
  const adFormMap = new Map(); // ad_id -> [form_ids]
  
  // Process ads in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);
    const promises = batch.map(async (adId) => {
      try {
        const creativeUrl = `https://graph.facebook.com/${META_API_VERSION}/${adId}/adcreatives`;
        const response = await axios.get(creativeUrl, {
          params: {
            access_token: accessToken,
            fields: "object_story_spec,effective_object_story_id"
          }
        });
        
        const creatives = response.data.data || [];
        const formIds = [];
        for (const creative of creatives) {
          const formId = extractFormIdFromCreative(creative);
          if (formId) {
            formIds.push(formId);
          }
        }
        
        if (formIds.length > 0) {
          adFormMap.set(adId, formIds);
        }
      } catch (err) {
        console.warn(`Error fetching creative for ad ${adId}:`, err.message);
      }
    });
    
    await Promise.all(promises);
  }
  
  return adFormMap;
}

// Helper: Get forms from campaigns
async function getFormsFromCampaigns(campaignIds, adAccountId, accessToken) {
  try {
    // Normalize ad account ID
    let accountId = adAccountId;
    if (accountId && accountId.startsWith('act_')) {
      accountId = accountId.substring(4);
    }
    
    // Get all ads in the specified campaigns
    const adsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads`;
    const filtering = [{
      field: "campaign.id",
      operator: "IN",
      value: Array.isArray(campaignIds) ? campaignIds : [campaignIds]
    }];
    
    const response = await axios.get(adsUrl, {
      params: {
        access_token: accessToken,
        fields: "id",
        filtering: JSON.stringify(filtering),
        limit: 1000
      }
    });
    
    const ads = response.data.data || [];
    const adIds = ads.map(ad => ad.id);
    
    if (adIds.length === 0) {
      return new Set();
    }
    
    // Get forms from all ads
    const adFormMap = await getFormsFromAds(adIds, accessToken);
    
    // Collect all unique form IDs
    const formIds = new Set();
    adFormMap.forEach((formIdArray) => {
      formIdArray.forEach(formId => formIds.add(formId));
    });
    
    return formIds;
  } catch (err) {
    console.error("Error getting forms from campaigns:", err.response?.data || err.message);
    return new Set();
  }
}

// Helper: Get forms from ad account
async function getFormsFromAdAccount(adAccountId, accessToken) {
  try {
    // Normalize ad account ID
    let accountId = adAccountId;
    if (accountId && accountId.startsWith('act_')) {
      accountId = accountId.substring(4);
    }
    
    // Get all campaigns
    const campaignsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns`;
    const campaignsResponse = await axios.get(campaignsUrl, {
      params: {
        access_token: accessToken,
        fields: "id",
        limit: 1000
      }
    });
    
    const campaigns = campaignsResponse.data.data || [];
    const campaignIds = campaigns.map(c => c.id);
    
    if (campaignIds.length === 0) {
      return new Set();
    }
    
    // Get forms from all campaigns
    return await getFormsFromCampaigns(campaignIds, accountId, accessToken);
  } catch (err) {
    console.error("Error getting forms from ad account:", err.response?.data || err.message);
    return new Set();
  }
}

// ---------------------------------------------------------------------
// 0) CREDENTIALS API
//    GET /api/meta/credentials - Check if configured
//    POST /api/meta/credentials - Save to .env
// ---------------------------------------------------------------------
router.get("/credentials", optionalAuthMiddleware, (req, res) => {
  const configured = !!process.env.META_ACCESS_TOKEN && !!process.env.META_AD_ACCOUNT_ID;
  res.json({
    configured,
    appId: process.env.META_APP_ID || "",
    adAccountId: process.env.META_AD_ACCOUNT_ID || "",
  });
});

router.post("/credentials", optionalAuthMiddleware, async (req, res) => {
  const { appId, appSecret, adAccountId, accessToken, systemAccessToken } = req.body;

  if (!adAccountId || !accessToken) {
    return res.status(400).json({ error: "Ad Account ID and Access Token are required" });
  }

  try {
    // 1. Update process.env in memory
    if (appId) process.env.META_APP_ID = appId;
    if (appSecret) process.env.META_APP_SECRET = appSecret;
    process.env.META_AD_ACCOUNT_ID = adAccountId;
    process.env.META_ACCESS_TOKEN = accessToken;
    // System token for leads API (optional, falls back to regular token if not provided)
    if (systemAccessToken) {
      process.env.META_SYSTEM_ACCESS_TOKEN = systemAccessToken;
    }

    // 2. Write to server/.env file
    const envPath = path.join(__dirname, '..', '.env');

    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }

    const updateKey = (key, val) => {
      const regex = new RegExp(`^${key}=.*`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };

    if (appId) updateKey('META_APP_ID', appId);
    if (appSecret) updateKey('META_APP_SECRET', appSecret);
    updateKey('META_AD_ACCOUNT_ID', adAccountId);
    updateKey('META_ACCESS_TOKEN', accessToken);
    if (systemAccessToken) {
      updateKey('META_SYSTEM_ACCESS_TOKEN', systemAccessToken);
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');

    res.json({
      success: true,
      message: "Credentials saved successfully.",
      configured: true
    });

  } catch (error) {
    console.error("Error saving credentials:", error);
    res.status(500).json({ error: "Failed to save credentials to server" });
  }
});

// ---------------------------------------------------------------------
// 1) CAMPAIGN LIST API
//    GET /api/meta/campaigns (fetch all campaigns from ad account)
// ---------------------------------------------------------------------
router.get("/campaigns", optionalAuthMiddleware, async (req, res) => {
  try {
    const credentials = getCredentials();
    
    // Check cache first
    const now = Date.now();
    if (campaignsCache.data.length > 0 && campaignsCache.lastFetched && (now - campaignsCache.lastFetched) < campaignsCache.ttl) {
      console.log("Returning cached campaigns data");
      return res.json({ data: campaignsCache.data, cached: true });
    }

    // Fetch all campaigns from ad account
    const { data } = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/act_${credentials.adAccountId}/campaigns`,
      {
        params: {
          access_token: credentials.accessToken,
          fields: "id,name,status,effective_status,objective",
          limit: 1000, // Increased limit to get all campaigns
        },
      }
    );

    const campaigns = data.data || [];

    // Update cache
    campaignsCache.data = campaigns;
    campaignsCache.lastFetched = now;

    res.json({ data: campaigns, cached: false });
  } catch (err) {
    console.error("Meta API Campaigns Error:", err.response?.data || err.message);

    // Check for Meta OAuth errors (expired token, etc.)
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env"
      });
    }

    res.status(500).json({
      error: "Failed to fetch campaigns",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 2) INSIGHTS API (CAMPAIGN-BASED + DATE-BASED)
//    GET /api/meta/insights
// ---------------------------------------------------------------------
router.get("/insights", optionalAuthMiddleware, async (req, res) => {
  try {
    const credentials = getCredentials();
    const { campaign_id, ad_id, from, to, days, time_increment, ad_account_id } = req.query;
    console.log("Insights","campaign_id", campaign_id, "ad_id", ad_id, "from", from, "to", to, "days", days, "time_increment", time_increment, "ad_account_id", ad_account_id);
    
    // Use provided ad_account_id or fall back to env variable
    let adAccountId = ad_account_id || credentials.adAccountId;
    
    // Validate ad account ID
    if (!adAccountId) {
      return res.status(400).json({
        error: "Ad Account ID is required",
        details: "Please provide ad_account_id parameter or configure META_AD_ACCOUNT_ID in settings"
      });
    }
    
    // Remove 'act_' prefix if present
    if (adAccountId && adAccountId.startsWith('act_')) {
      adAccountId = adAccountId.substring(4);
    }
    
    // Validate ad account ID format (should be numeric after removing act_)
    if (!/^\d+$/.test(adAccountId)) {
      return res.status(400).json({
        error: "Invalid Ad Account ID format",
        details: `Ad Account ID must be numeric, got: ${adAccountId}`
      });
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    let useTimeRange = false;
    let timeRange = null;

    if (from && to && dateRegex.test(from) && dateRegex.test(to)) {
      useTimeRange = true;
      timeRange = JSON.stringify({ since: from, until: to });
    }
    console.log("timeRange", timeRange, "days", days, "time_increment", time_increment, "adAccountId", adAccountId);
    const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/insights`;

    // Determine level: 
    // - If ad_id is provided, use ad level
    // - If no campaign_id filter (all campaigns selected), use ad level to filter by ad status
    // - Otherwise, use campaign level
    // Use ad-level when we need to filter by ad status (when all campaigns selected or ad_id provided)
    // Safely check if campaign_id is empty (undefined, null, or empty string)
    const campaignIdIsEmpty = !campaign_id || (typeof campaign_id === 'string' && campaign_id.trim() === "");
    const needsAdLevelFiltering = (ad_id && ad_id.trim() !== "") || campaignIdIsEmpty;
    const level = needsAdLevelFiltering ? "ad" : "campaign";
    const fields = level === "ad" 
      ? "ad_id,ad_name,campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions,action_values,date_start,date_stop"
      : "campaign_id,campaign_name,impressions,clicks,spend,ctr,cpc,actions,action_values,date_start,date_stop,account_name";

    const params = {
      access_token: credentials.accessToken,
      level: level,
      fields: fields,
      limit: 1000, // Increased limit to get more data when all campaigns are selected
    };

    // Build filtering array
    const filtering = [];
    
    // Support filtering by both campaigns and ads simultaneously
    // Parse ad IDs if provided
    let adIdArray = [];
    if (ad_id && ad_id.trim() !== "") {
      adIdArray = ad_id.split(',').map(id => id.trim()).filter(id => id !== '');
      filtering.push({
        field: "ad.id",
        operator: "IN",
        value: adIdArray,
      });
    }
    
    // Add campaign filter if provided (can be combined with ad filter)
    let campaignIdArray = [];
    if (campaign_id && campaign_id.trim() !== "") {
      campaignIdArray = campaign_id.split(',').map(id => id.trim()).filter(id => id !== '');
      filtering.push({
        field: "campaign.id",
        operator: "IN",
        value: campaignIdArray,
      });
    }

    // Always filter by active status using effective_status
    // This ensures only active campaigns/ads are returned
    if (level === "campaign") {
      filtering.push({
        field: "campaign.effective_status",
        operator: "IN",
        value: ["ACTIVE"]
      });
    } else if (level === "ad") {
      // For ad-level insights, filter by both campaign and ad status
      filtering.push({
        field: "campaign.effective_status",
        operator: "IN",
        value: ["ACTIVE"]
      });
      filtering.push({
        field: "ad.effective_status",
        operator: "IN",
        value: ["ACTIVE"]
      });
    }

    // Always add filtering (now includes status filters)
    if (filtering.length > 0) {
      params.filtering = JSON.stringify(filtering);
      console.log("[Backend] Filtering by campaigns:", campaignIdArray.length > 0 ? campaignIdArray : 'none');
      console.log("[Backend] Filtering by ads:", adIdArray.length > 0 ? adIdArray : 'none');
      console.log("[Backend] Status filters: campaign.effective_status=ACTIVE" + (level === "ad" ? ", ad.effective_status=ACTIVE" : ""));
      console.log("[Backend] Total filters:", filtering.length);
    }

    // Support for time_increment (charts)
    if (time_increment) {
      params.time_increment = time_increment;
    }

    if (useTimeRange) {
      params.time_range = timeRange;
    } else {
      // Fallback or 'days' param support
      const dayMap = { '7': 'last_7d', '14': 'last_14d', '30': 'last_30d', '90': 'last_90d' };
      if (days && dayMap[days]) {
        params.date_preset = dayMap[days];
      } else {
        params.date_preset = "last_7d";
      }
    }

    // Fetch insights with pagination support
    let allInsights = [];
    let nextUrl = null;
    let currentParams = { ...params };
    let pageCount = 0;
    const maxPages = 10; // Limit to prevent infinite loops

    do {
      const response = await axios.get(insightsUrl, { params: currentParams });
      const responseData = response.data;
      
      if (Array.isArray(responseData.data)) {
        allInsights = allInsights.concat(responseData.data);
      } else if (Array.isArray(responseData)) {
        allInsights = allInsights.concat(responseData);
      }

      // Check for pagination
      if (responseData.paging && responseData.paging.next) {
        nextUrl = responseData.paging.next;
        // Extract cursor from next URL for next request
        const urlObj = new URL(responseData.paging.next);
        currentParams.after = urlObj.searchParams.get('after');
        pageCount++;
      } else {
        nextUrl = null;
      }
    } while (nextUrl && pageCount < maxPages);

    // Return aggregated insights
    res.json({ data: allInsights });
  } catch (err) {
    console.error("Meta API Insights Error:", err.response?.data || err.message);

    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env"
      });
    }

    res.status(500).json({
      error: "Failed to fetch insights",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 3) ACTIVE CAMPAIGNS SUMMARY (SPEND, LEADS, CPL, etc.)
//    GET /api/meta/active-campaigns
// ---------------------------------------------------------------------
router.get("/active-campaigns", optionalAuthMiddleware, async (req, res) => {
  try {
    const credentials = getCredentials();
    const { from, to, ad_account_id } = req.query;

    // Use provided ad_account_id or fall back to env variable
    let adAccountId = ad_account_id || credentials.adAccountId;
    // Remove 'act_' prefix if present
    if (adAccountId && adAccountId.startsWith('act_')) {
      adAccountId = adAccountId.substring(4);
    }

    // Validate date format: YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let timeRange = null;

    if (from && to && dateRegex.test(from) && dateRegex.test(to)) {
      timeRange = JSON.stringify({ since: from, until: to });
    }

    // 1) Get all campaigns
    const campaignsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/campaigns`;
    const campaignsResp = await axios.get(campaignsUrl, {
      params: {
        access_token: credentials.accessToken,
        fields: "id,name,status,effective_status,objective",
        limit: 100,
      },
    });

    const allCampaigns = campaignsResp.data.data || [];

    // 2) Only ACTIVE
    const activeCampaigns = allCampaigns.filter(
      (c) => c.effective_status === "ACTIVE" || c.status === "ACTIVE"
    );

    if (!activeCampaigns.length) {
      return res.json({ data: [], message: "No active campaigns found" });
    }

    const activeIds = activeCampaigns.map((c) => c.id);

    // 3) Insights for active campaigns - use the same adAccountId (from query or default)
    const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/insights`;

    const filtering = [
      {
        field: "campaign.id",
        operator: "IN",
        value: activeIds,
      },
    ];

    const params = {
      access_token: credentials.accessToken,
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,unique_actions",
      filtering: JSON.stringify(filtering),
      limit: 100,
    };

    if (timeRange) {
      params.time_range = timeRange;
    } else {
      params.date_preset = "last_30d";
    }

    const insightsResp = await axios.get(insightsUrl, { params });
    const insightsRows = insightsResp.data.data || [];

    const metricsByCampaign = {};

    insightsRows.forEach((row) => {
      const id = row.campaign_id;
      const spend = parseFloat(row.spend || "0") || 0;

      let leads = 0;
      let uniqueLeads = 0;

      if (Array.isArray(row.actions)) {
        row.actions.forEach((a) => {
          if (
            a.action_type === "lead" ||
            a.action_type === "leads" ||
            a.action_type === "onsite_conversion.lead_grouped"
          ) {
            leads += parseFloat(a.value || "0") || 0;
          }
        });
      }

      if (Array.isArray(row.unique_actions)) {
        row.unique_actions.forEach((a) => {
          if (
            a.action_type === "lead" ||
            a.action_type === "leads" ||
            a.action_type === "onsite_conversion.lead_grouped"
          ) {
            uniqueLeads += parseFloat(a.value || "0") || 0;
          }
        });
      }

      const cpl = leads > 0 ? spend / leads : null;

      metricsByCampaign[id] = {
        campaign_name: row.campaign_name,
        spend,
        leads,
        unique_leads: uniqueLeads,
        cpl,
      };
    });

    const result = activeCampaigns.map((c) => {
      const m = metricsByCampaign[c.id] || {
        spend: 0,
        leads: 0,
        unique_leads: 0,
        cpl: null,
      };

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        effective_status: c.effective_status,
        objective: c.objective,
        ad_spend: m.spend,
        leads: m.leads,
        unique_leads: m.unique_leads,
        cpl: m.cpl,
      };
    });

    res.json({ data: result });
    console.log("Fetched active campaign metrics successfully");
  } catch (err) {
    console.error("Error fetching active campaign metrics:", err.response?.data || err.message);

    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env"
      });
    }

    res.status(500).json({
      error: "Failed to fetch campaign metrics",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 4) ADS LIST API
//    GET /api/meta/ads?campaign_id=xxx (legacy - for backward compatibility)
//    GET /api/meta/ads/all (new - fetch all ads from ad account)
// ---------------------------------------------------------------------
router.get("/ads", optionalAuthMiddleware, async (req, res) => {
  try {
    const credentials = getCredentials();
    const { campaign_id, all } = req.query;

    // New endpoint: fetch all ads from ad account
    if (all === 'true' || all === '1') {
      return await fetchAllAds(credentials, res);
    }

    // Legacy endpoint: fetch ads for specific campaign
    if (!campaign_id || campaign_id.trim() === "") {
      return res.status(400).json({ error: "campaign_id is required" });
    }

    // Fetch ads for the given campaign using the campaign's ads edge
    const adsUrl = `https://graph.facebook.com/${META_API_VERSION}/${campaign_id}/ads`;
    const { data } = await axios.get(adsUrl, {
      params: {
        access_token: credentials.accessToken,
        fields: "id,name,status,effective_status",
        limit: 200,
      },
    });

    // Return the data in the same format as campaigns endpoint
    res.json(data);
  } catch (err) {
    console.error("Meta API Ads Error:", err.response?.data || err.message);

    // Handle authentication errors
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env"
      });
    }

    // Handle invalid parameter errors (campaign might not exist or have no ads)
    if (err.response?.data?.error?.code === 100) {
      console.warn("Invalid parameter or campaign has no ads, returning empty array");
      return res.json({ data: [] });
    }

    // Handle invalid campaign ID errors (campaign might not exist or be inaccessible)
    if (err.response?.data?.error?.code === 1487295 || 
        err.response?.data?.error?.error_subcode === 1487295 ||
        (err.response?.data?.error?.message && 
         (err.response.data.error.message.includes('Invalid campaign') || 
          err.response.data.error.message.includes('does not exist')))) {
      console.warn("Campaign not found or invalid, returning empty array");
      return res.json({ data: [] });
    }

    // Handle permission errors
    if (err.response?.data?.error?.code === 200 || 
        err.response?.data?.error?.code === 10) {
      return res.status(403).json({
        error: "Insufficient permissions",
        details: err.response.data.error.message || "Permission denied",
        isPermissionError: true
      });
    }

    // For other errors, log and return 500 with details
    res.status(500).json({
      error: "Failed to fetch ads",
      details: err.response?.data || err.message,
    });
  }
});

// Helper function to fetch all ads from ad account
async function fetchAllAds(credentials, res) {
  try {
    // Check cache first
    const now = Date.now();
    if (adsCache.data.length > 0 && adsCache.lastFetched && (now - adsCache.lastFetched) < adsCache.ttl) {
      console.log("Returning cached ads data");
      return res.json({ data: adsCache.data, cached: true });
    }

    // Fetch all ads from ad account
    const adsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${credentials.adAccountId}/ads`;
    const { data } = await axios.get(adsUrl, {
      params: {
        access_token: credentials.accessToken,
        fields: "id,name,status,effective_status,campaign_id",
        limit: 1000, // Increased limit to get more ads
      },
    });

    let allAds = data.data || [];

    // Fetch campaign names for each ad
    // First, get all unique campaign IDs
    const campaignIds = [...new Set(allAds.map(ad => ad.campaign_id).filter(Boolean))];
    
    // Fetch campaign details
    const campaignsMap = new Map();
    if (campaignIds.length > 0) {
      try {
        const campaignsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${credentials.adAccountId}/campaigns`;
        const campaignsResp = await axios.get(campaignsUrl, {
          params: {
            access_token: credentials.accessToken,
            fields: "id,name",
            limit: 1000,
          },
        });
        
        (campaignsResp.data.data || []).forEach(campaign => {
          campaignsMap.set(campaign.id, campaign.name);
        });
      } catch (campaignErr) {
        console.warn("Error fetching campaign names:", campaignErr.message);
      }
    }

    // Enrich ads with campaign name
    const enrichedAds = allAds.map(ad => ({
      id: ad.id,
      name: ad.name,
      status: ad.status,
      effective_status: ad.effective_status,
      campaign_id: ad.campaign_id,
      campaign_name: campaignsMap.get(ad.campaign_id) || null,
    }));

    // Update cache
    adsCache.data = enrichedAds;
    adsCache.lastFetched = now;

    res.json({ data: enrichedAds, cached: false });
  } catch (err) {
    console.error("Error fetching all ads:", err.response?.data || err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------
// 5.0) AD ACCOUNTS API - Fetch ad accounts
//    GET /api/meta/ad-accounts
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/ad-accounts", optionalAuthMiddleware, async (req, res) => {
  try {
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Meta Access Token missing. Please configure it in Settings.");
    }

    const response = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        params: {
          fields: "account_id,name,currency,timezone_name,account_status",
          limit: 100,
        },
      }
    );
    
    // Log raw response structure for debugging
    console.log(`[Ad Accounts API] Raw response structure:`, {
      hasData: !!response.data,
      hasDataData: !!(response.data && response.data.data),
      dataKeys: response.data ? Object.keys(response.data) : [],
      isArray: Array.isArray(response.data),
      sampleResponse: response.data ? (Array.isArray(response.data) ? response.data[0] : response.data.data?.[0]) : null
    });
    
    const accountsData = response.data.data || [];
    
    console.log(`[Ad Accounts API] Fetched ${accountsData.length} ad accounts from Meta API`);
    
    const accounts = accountsData.map(account => ({
      account_id: account.account_id,
      account_name: account.name || account.account_name || `Account ${account.account_id}`,
      currency: account.currency || "INR",
      timezone: account.timezone_name || "Asia/Kolkata",
      status: account.account_status === 1 ? "ACTIVE" : "INACTIVE",
    }));

    console.log(`[Ad Accounts API] Returning ${accounts.length} formatted accounts`);
    
    res.json(accounts);
  } catch (error) {
    console.error("Meta /ad-accounts error:", error.response?.data || error.message);
    
    if (error.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: error.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env",
      });
    }

    res.status(500).json({
      error: "Failed to fetch ad accounts",
      details: error.response?.data || error.message,
    });
    }
});

// ---------------------------------------------------------------------
// 4.1) BUSINESSES API - Fetch Business Manager accounts
//    GET /api/meta/businesses
//    Uses META_ACCESS_TOKEN with business_management permission
// ---------------------------------------------------------------------
router.get("/businesses", optionalAuthMiddleware, async (req, res) => {
  try {
    const accessToken = process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Meta Access Token missing. Please configure it in Settings.");
    }

    let allBusinesses = [];
    let nextUrl = `https://graph.facebook.com/${META_API_VERSION}/me/businesses`;
    let isFirstRequest = true;
    
    // Handle pagination
    while (nextUrl) {
      const requestConfig = {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      };
      
      // Only add params for the first request (paging.next URLs already contain all params)
      if (isFirstRequest) {
        requestConfig.params = {
          fields: "id,name",
          limit: 100,
        };
        isFirstRequest = false;
      }
      
      const response = await axios.get(nextUrl, requestConfig);
      
      const businessesData = response.data.data || [];
      allBusinesses = allBusinesses.concat(businessesData);
      
      // Check for pagination
      if (response.data.paging && response.data.paging.next) {
        nextUrl = response.data.paging.next;
      } else {
        nextUrl = null;
      }
    }
    
    console.log(`[Businesses API] Fetched ${allBusinesses.length} businesses from Meta API`);
    
    // Normalize response format
    const businesses = allBusinesses.map(business => ({
      business_id: business.id,
      business_name: business.name || `Business ${business.id}`,
    }));

    console.log(`[Businesses API] Returning ${businesses.length} formatted businesses`);
    
    res.json({ businesses });
  } catch (error) {
    console.error("Meta /businesses error:", error.response?.data || error.message);
    
    // Handle authentication errors
    if (error.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: error.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env",
      });
    }
    
    // Handle permission errors
    if (error.response?.data?.error?.code === 200 || 
        error.response?.data?.error?.code === 10 ||
        (error.response?.data?.error?.message && 
         error.response.data.error.message.includes('business_management'))) {
      return res.status(403).json({
        error: "Insufficient permissions",
        details: error.response.data.error.message || "business_management permission is required",
        isPermissionError: true,
        instruction: "Please ensure your Meta Access Token has the 'business_management' permission",
      });
    }
    
    // If no businesses found, return empty array (not an error)
    if (error.response?.data?.error?.code === 100) {
      console.warn("No businesses found or error 100, returning empty array");
      return res.json({ businesses: [] });
    }

    res.status(500).json({
      error: "Failed to fetch businesses",
      details: error.response?.data || error.message,
    });
  }
});

// ---------------------------------------------------------------------
// 5.1) PAGES API - Fetch pages
//    GET /api/meta/pages
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/pages", optionalAuthMiddleware, async (req, res) => {
  try {
    const accessToken = process.env.META_SYSTEM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Meta Access Token missing. Please configure it in Settings.");
    }

    const response = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/me/accounts`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    console.log("response", response.data);
    
    // Handle single object response (not an array)
    let pages = [];
    if (response.data && response.data.id) {
      // Single page object - wrap in array
      pages = [{
        id: response.data.id,
        name: response.data.name,
      }];
    } else if (Array.isArray(response.data)) {
      // Array of pages
      pages = response.data.map(page => ({
        id: page.id,
        name: page.name,
      }));
    } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
      // Nested array structure
      pages = response.data.data.map(page => ({
        id: page.id,
        name: page.name,
      }));
    }

    res.json({ data: pages });
  } catch (error) {
    console.error("Meta /pages error:", error.response?.data || error.message);
    
    if (error.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: error.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env",
      });
    }

    res.status(500).json({
      error: "Failed to fetch pages",
      details: error.response?.data || error.message,
    });
  }
});

// ---------------------------------------------------------------------
// 5.1.1) PAGE NAME API - Fetch page name by page ID
//    GET /api/meta/page-name?pageId=...
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/page-name", optionalAuthMiddleware, async (req, res) => {
  try {
    const { pageId } = req.query;
    
    if (!pageId || pageId.trim() === "") {
      return res.status(400).json({
        error: "pageId parameter is required",
        message: "Please provide a pageId to fetch page name"
      });
    }

    const accessToken = getSystemToken();
    const pageUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}`;
    
    try {
      const response = await axios.get(pageUrl, {
        params: {
          access_token: accessToken,
          fields: "name"
        }
      });

      res.json({
        page_id: pageId,
        page_name: response.data.name || `Page ${pageId}`
      });
    } catch (pageErr) {
      console.error(`[Page Name] Error fetching page ${pageId}:`, pageErr.response?.data || pageErr.message);
      
      if (pageErr.response?.data?.error?.code === 190) {
        return res.status(401).json({
          error: "Meta Access Token expired or invalid",
          details: pageErr.response.data.error.message,
          isAuthError: true,
          instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
        });
      }

      // If page not found or permission error
      if (pageErr.response?.status === 404 || pageErr.response?.data?.error?.code === 100) {
        return res.status(404).json({
          error: "Page not found",
          details: pageErr.response?.data?.error?.message || "Page ID is invalid or inaccessible"
        });
      }

      throw pageErr;
    }
  } catch (err) {
    console.error("[Page Name] Error:", err.response?.data || err.message);
    
    res.status(500).json({
      error: "Failed to fetch page name",
      details: err.response?.data || err.message
    });
  }
});

// ---------------------------------------------------------------------
// 5.2) FORMS API - Fetch leadgen forms for a page
//    GET /api/meta/pages/:pageId/forms
//    Uses Page Access Token (required by Meta's leadgen_forms API)
// ---------------------------------------------------------------------
router.get("/pages/:pageId/forms", optionalAuthMiddleware, async (req, res) => {
  try {
    const { pageId } = req.params;
    
    // Meta's leadgen_forms API requires a Page Access Token, not a System User Token
    const pageAccessToken = await getPageAccessToken(pageId);
    const formsUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`;
    
    const params = {
      access_token: pageAccessToken,
      fields: "id,name,locale,status",
      limit: 1000,
    };

    console.log(`Fetching forms for page ${pageId} from:`, formsUrl);
    const { data } = await axios.get(formsUrl, { params });
    
    const forms = data.data || [];

    res.json({ data: forms });
    console.log(`Found ${forms.length} forms for page ${pageId}`);
  } catch (err) {
    console.error("Error fetching forms:", err.response?.data || err.message);
    
    const errorData = err.response?.data?.error;
    const errorCode = errorData?.code;
    const errorMsg = errorData?.message || err.message;

    // Handle token expiration (190)
    if (errorCode === 190) {
      // Clear cache for this page
      if (pageTokenCache.tokens[req.params.pageId]) {
        delete pageTokenCache.tokens[req.params.pageId];
      }
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: errorMsg,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }

    // Handle permission errors (200, 10)
    if (errorCode === 200) {
      return res.status(403).json({
        error: "Permission error",
        details: errorMsg,
        instruction: "Ensure your System User Token has 'leads_retrieval' and 'pages_read_engagement' permissions"
      });
    }

    if (errorCode === 10) {
      return res.status(403).json({
        error: "Permission denied",
        details: errorMsg,
        instruction: "Check that your System User Token has access to this page and required permissions"
      });
    }

    res.status(500).json({
      error: "Failed to fetch forms",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 5.2.1) FORMS BY AD API - Fetch forms that received leads from a specific ad
//    GET /api/meta/forms?adId=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
//    
//    Implementation: Derive forms from leads (Meta doesn't support "get forms by ad")
//    1. Fetch all leads in date range
//    2. Filter leads WHERE lead.ad_id === adId
//    3. Collect unique form_ids from filtered leads
//    4. Fetch form names for each form_id
//    5. Return list of forms
//    
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/forms", optionalAuthMiddleware, async (req, res) => {
  try {
    const { adId, start, end, pageId } = req.query;
    
    // Validate required parameters
    if (!adId || adId.trim() === "") {
      return res.status(400).json({
        error: "adId parameter is required",
        message: "Please provide an adId to fetch forms"
      });
    }

    // Validate date format if provided
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let dateFrom = start;
    let dateTo = end;

    // Default to last 30 days if dates not provided
    if (!dateFrom || !dateTo || !dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 29);
      dateFrom = startDate.toISOString().slice(0, 10);
      dateTo = endDate.toISOString().slice(0, 10);
    }

    // Check for pre-loaded data first
    if (pageId) {
      const preloadCacheKey = `preload_${pageId}_${dateFrom}_${dateTo}`;
      const now = Date.now();
      if (preloadLeadsCache.data[preloadCacheKey] && preloadLeadsCache.lastFetched[preloadCacheKey] &&
          (now - preloadLeadsCache.lastFetched[preloadCacheKey]) < preloadLeadsCache.ttl) {
        console.log(`[Forms by Ad] Using pre-loaded leads data for page ${pageId}`);
        
        const preloadedData = preloadLeadsCache.data[preloadCacheKey];
        const leads = preloadedData.leads || [];
        const forms = preloadedData.forms || [];
        
        // Normalize adId to string for comparison
        const normalizedAdId = String(adId);
        console.log(`[Forms by Ad] Filtering leads for ad ${adId} (normalized: ${normalizedAdId})`);
        console.log(`[Forms by Ad] Total pre-loaded leads: ${leads.length}`);
        
        // Filter leads by adId - both sides normalized to strings
        const matchingLeads = leads.filter(lead => {
          if (!lead.ad_id) return false;
          const leadAdId = String(lead.ad_id);
          return leadAdId === normalizedAdId;
        });
        
        console.log(`[Forms by Ad] Found ${matchingLeads.length} matching leads for ad ${adId}`);
        
        // Get unique form_ids from matching leads
        const formIds = [...new Set(matchingLeads.map(lead => lead.form_id).filter(Boolean))];
        console.log(`[Forms by Ad] Unique form IDs from matching leads:`, formIds);
        
        // Map to forms with names from preloaded forms or from lead's form_name
        const formsList = formIds.map(formId => {
          // First try to find in preloaded forms list
          let form = forms.find(f => String(f.form_id) === String(formId));
          
          // If not found, try to get form name from lead's form_name
          if (!form) {
            const leadWithForm = matchingLeads.find(l => String(l.form_id) === String(formId));
            if (leadWithForm && leadWithForm.form_name) {
              form = { form_id: formId, name: leadWithForm.form_name };
            }
          }
          
          return {
            form_id: formId,
            name: form?.name || `Form ${formId}`
          };
        });
        
        console.log(`[Forms by Ad] Found ${formsList.length} forms from pre-loaded data for ad ${adId}:`, formsList);
        
        // Cache the result for future use
        const cacheKey = `${adId}_${dateFrom}_${dateTo}`;
        formsCache.data[cacheKey] = formsList;
        formsCache.lastFetched[cacheKey] = now;
        
        return res.json({ data: formsList, cached: false, fromPreload: true });
      }
    }

    // Check cache
    const cacheKey = `${adId}_${dateFrom}_${dateTo}`;
    const now = Date.now();
    if (formsCache.data[cacheKey] && formsCache.lastFetched[cacheKey] && 
        (now - formsCache.lastFetched[cacheKey]) < formsCache.ttl) {
      console.log(`[Forms by Ad] Returning cached forms for ad ${adId}`);
      return res.json({ data: formsCache.data[cacheKey], cached: true });
    }

    const accessToken = getSystemToken();
    const credentials = getCredentials();
    
    console.log(`[Forms by Ad] Fetching forms for ad ${adId} from ${dateFrom} to ${dateTo}`);

    // Step 1: Fetch all accessible pages and their forms
    let pages = [];
    try {
      const pagesResponse = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/me/accounts`,
        { params: { access_token: accessToken, fields: "id", limit: 1000 } }
      );
      pages = (pagesResponse.data.data || []).map(p => p.id);
      console.log(`[Forms by Ad] Found ${pages.length} pages`);
    } catch (pagesErr) {
      console.error(`[Forms by Ad] Error fetching pages:`, pagesErr.response?.data || pagesErr.message);
      return res.json({ data: [], cached: false });
    }

    if (pages.length === 0) {
      console.log(`[Forms by Ad] No pages found`);
      formsCache.data[cacheKey] = [];
      formsCache.lastFetched[cacheKey] = now;
      return res.json({ data: [], cached: false });
    }

    // Step 2: Fetch all forms from all pages using Page Access Tokens
    // Meta's leadgen_forms API requires a Page Access Token, not a System User Token
    const allForms = [];
    const formPromises = pages.map(async (pageId) => {
      try {
        // Get Page Access Token for this page
        const pageAccessToken = await getPageAccessToken(pageId);
        const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`, {
          params: {
            access_token: pageAccessToken,
            fields: "id,page_id",
            limit: 1000
          }
        });
        // Add page_id to each form for later use
        return (response.data.data || []).map(form => ({ ...form, page_id: pageId }));
      } catch (err) {
        const errorData = err.response?.data?.error;
        const errorCode = errorData?.code;
        
        // Handle token errors
        if (errorCode === 190) {
          // Clear cache for this page
          if (pageTokenCache.tokens[pageId]) {
            delete pageTokenCache.tokens[pageId];
          }
          console.warn(`[Forms by Ad] Token expired for page ${pageId}:`, errorData?.message || err.message);
        } else if (errorCode === 200 || errorCode === 10) {
          console.warn(`[Forms by Ad] Permission error for page ${pageId}:`, errorData?.message || err.message);
        } else {
          console.warn(`[Forms by Ad] Error fetching forms for page ${pageId}:`, err.message);
        }
        return [];
      }
    });

    const allFormsArrays = await Promise.all(formPromises);
    allForms.push(...allFormsArrays.flat());
    console.log(`[Forms by Ad] Found ${allForms.length} total forms across all pages`);

    // Step 3: Fetch leads from all forms in the date range
    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    const formIdsWithLeads = new Set();
    const leadPromises = allForms.map(async (form) => {
      try {
        // Meta's /leads API requires a Page Access Token for the form's page
        const formPageId = form.page_id;
        if (!formPageId) {
          console.warn(`[Forms by Ad] Form ${form.id} has no page_id, skipping`);
          return;
        }
        
        const pageAccessToken = await getPageAccessToken(formPageId);
        const leadsUrl = `https://graph.facebook.com/${META_API_VERSION}/${form.id}/leads`;
        const leadsResponse = await axios.get(leadsUrl, {
          headers: { Authorization: `Bearer ${pageAccessToken}` },
          params: {
            fields: "id,created_time,ad_id",
            limit: 1000 // Fetch enough to find matches
          }
        });

        const leads = leadsResponse.data.data || [];
        
        // Filter leads by date range and ad_id
        for (const lead of leads) {
          // Check date range
          if (lead.created_time) {
            const leadDate = new Date(lead.created_time);
            if (leadDate < startDate || leadDate > endDate) {
              continue;
            }
          }

          // Check if lead has ad_id and matches the requested adId
          // Note: Meta Leads API may not always return ad_id - we'll check if it exists
          if (lead.ad_id && lead.ad_id === adId) {
            formIdsWithLeads.add(form.id);
            console.log(`[Forms by Ad] Found matching lead in form ${form.id} with ad_id ${lead.ad_id}`);
          }
        }
      } catch (leadErr) {
        const errorData = leadErr.response?.data?.error;
        const errorCode = errorData?.code;
        const errorMsg = errorData?.message || leadErr.message;
        
        // Handle token errors
        if (errorCode === 190) {
          // Clear cache for this page
          const formPageId = form.page_id;
          if (formPageId && pageTokenCache.tokens[formPageId]) {
            delete pageTokenCache.tokens[formPageId];
          }
          console.warn(`[Forms by Ad] Token expired while fetching leads for form ${form.id}:`, errorMsg);
        } else if (errorCode === 200 || errorCode === 10) {
          console.warn(`[Forms by Ad] Permission error while fetching leads for form ${form.id}:`, errorMsg);
        } else {
          // Skip forms that can't be accessed - non-fatal
          console.warn(`[Forms by Ad] Error checking leads for form ${form.id}:`, errorMsg);
        }
        // Continue to next form
      }
    });

    await Promise.all(leadPromises);

    // If no forms found via ad_id matching, try alternative approach:
    // Use Insights API to verify ad has leads, then return all forms from pages that have leads in date range
    if (formIdsWithLeads.size === 0) {
      console.log(`[Forms by Ad] No leads found with ad_id=${adId}, trying Insights API correlation`);
      
      // Check if ad has leads via Insights API
      let accountId = credentials.adAccountId;
      if (accountId && accountId.startsWith('act_')) {
        accountId = accountId.substring(4);
      }

      try {
        const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights`;
        const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
        
        const insightsResponse = await axios.get(insightsUrl, {
          params: {
            access_token: credentials.accessToken,
            level: "ad",
            fields: "ad_id,actions",
            filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: [adId] }]),
            time_range: timeRange,
            limit: 1
          }
        });

        const insightsData = insightsResponse.data.data || [];
        const hasLeads = insightsData.length > 0 && insightsData[0].actions?.some(
          action => action.action_type === 'lead' || action.action_type === 'onsite_conversion.lead_grouped'
        );

        if (!hasLeads) {
          console.log(`[Forms by Ad] Ad ${adId} has no leads in date range`);
          formsCache.data[cacheKey] = [];
          formsCache.lastFetched[cacheKey] = now;
          return res.json({ data: [], cached: false });
        }

        // If ad has leads but we couldn't match via ad_id, return all forms that have leads in date range
        // This is a fallback when ad_id attribution is not available in Leads API
        for (const form of allForms) {
          try {
            const leadsUrl = `https://graph.facebook.com/${META_API_VERSION}/${form.id}/leads`;
            const leadsResponse = await axios.get(leadsUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                fields: "id,created_time",
                limit: 1000
              }
            });

            const leads = leadsResponse.data.data || [];
            const hasLeadsInRange = leads.some(lead => {
              if (!lead.created_time) return false;
              const leadDate = new Date(lead.created_time);
              return leadDate >= startDate && leadDate <= endDate;
            });

            if (hasLeadsInRange) {
              formIdsWithLeads.add(form.id);
            }
          } catch (err) {
            // Skip forms with errors
            continue;
          }
        }
      } catch (insightsErr) {
        console.warn(`[Forms by Ad] Error with Insights API fallback:`, insightsErr.message);
      }
    }

    if (formIdsWithLeads.size === 0) {
      console.log(`[Forms by Ad] No forms found with leads attributed to ad ${adId}`);
      formsCache.data[cacheKey] = [];
      formsCache.lastFetched[cacheKey] = now;
      return res.json({ data: [], cached: false });
    }

    // Step 4: Fetch form names for each form_id
    const formsList = [];
    for (const formId of formIdsWithLeads) {
      try {
        const formResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${formId}`,
          { params: { access_token: accessToken, fields: "name" } }
        );
        formsList.push({
          form_id: formId,
          name: formResponse.data.name || `Form ${formId}`
        });
      } catch (formErr) {
        console.warn(`[Forms by Ad] Error fetching form ${formId} name:`, formErr.message);
        // Include form anyway with ID as name
        formsList.push({
          form_id: formId,
          name: `Form ${formId}`
        });
      }
    }

    console.log(`[Forms by Ad] Returning ${formsList.length} forms for ad ${adId}`);

    // Cache the result
    formsCache.data[cacheKey] = formsList;
    formsCache.lastFetched[cacheKey] = now;

    res.json({ data: formsList, cached: false });
  } catch (err) {
    console.error("[Forms by Ad] Error:", err.response?.data || err.message);
    
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }

    res.status(500).json({
      error: "Failed to fetch forms",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 5.2.1) PAGE INSIGHTS API - Fetch page insights (followers, reach, etc.)
//    GET /api/meta/pages/:pageId/insights
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/pages/:pageId/insights", optionalAuthMiddleware, async (req, res) => {
  try {
    const { pageId } = req.params;
    const { from, to, metric } = req.query;
    
    const accessToken = getSystemToken();
    
    // Default metrics if not specified
    const metrics = metric || "page_fans,page_reach,page_impressions,page_fan_adds,page_fan_removes";
    
    // Date range handling
    let since = null;
    let until = null;
    
    if (from && to) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(from) && dateRegex.test(to)) {
        since = from;
        until = to;
      }
    }
    
    // Default to last 30 days if no date range provided
    if (!since || !until) {
      const today = new Date();
      const thirtyDaysAgo = new Date(today);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      until = today.toISOString().split('T')[0];
      since = thirtyDaysAgo.toISOString().split('T')[0];
    }
    
    const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/insights`;
    
    const params = {
      access_token: accessToken,
      metric: metrics,
      period: "day",
      since: since,
      until: until,
    };
    
    // Helper to process insights response into totals
    const processInsights = (insightsData, periodLabel) => {
      const processedData = {
        followers: [],
        reach: [],
        impressions: [],
        fan_adds: [],
        fan_removes: [],
        views: [],
        interactions: [],
        current_followers: 0,
        current_reach: 0,
        total_follows: 0,      // Total follows (page_fan_adds sum)
        total_unfollows: 0,    // Total unfollows (page_fan_removes sum)
        total_reached: 0,      // Total reached (page_impressions_unique sum)
        total_views: 0,        // Total views (page_views_total)
        total_interactions: 0, // Total interactions (page_engaged_users)
        period: periodLabel
      };
      
      insightsData.forEach(metric => {
        const metricName = metric.name;
        const values = metric.values || [];
        
        if (metricName === 'page_fans') {
          if (values.length > 0) {
            processedData.current_followers = parseInt(values[values.length - 1].value || 0);
          }
          processedData.followers = values.map(v => ({
            date: v.end_time ? v.end_time.split('T')[0] : null,
            value: parseInt(v.value || 0)
          })).filter(v => v.date);
        } else if (metricName === 'page_reach') {
          let totalReach = 0;
          const reachByDate = {};
          values.forEach(v => {
            const date = v.end_time ? v.end_time.split('T')[0] : null;
            if (date) {
              if (!reachByDate[date]) {
                reachByDate[date] = 0;
              }
              reachByDate[date] += parseInt(v.value || 0);
              totalReach += parseInt(v.value || 0);
            }
          });
          processedData.reach = Object.entries(reachByDate).map(([date, value]) => ({
            date,
            value
          })).sort((a, b) => a.date.localeCompare(b.date));
          processedData.current_reach = totalReach;
          if (processedData.total_reached === 0) {
            processedData.total_reached = totalReach;
          }
        } else if (metricName === 'page_impressions_unique') {
          let totalReached = 0;
          values.forEach(v => {
            totalReached += parseInt(v.value || 0);
          });
          processedData.total_reached = totalReached;
          processedData.reach = values.map(v => ({
            date: v.end_time ? v.end_time.split('T')[0] : null,
            value: parseInt(v.value || 0)
          })).filter(v => v.date);
        } else if (metricName === 'page_impressions') {
          processedData.impressions = values.map(v => ({
            date: v.end_time ? v.end_time.split('T')[0] : null,
            value: parseInt(v.value || 0)
          })).filter(v => v.date);
        } else if (metricName === 'page_fan_adds') {
          let totalFollows = 0;
          processedData.fan_adds = values.map(v => {
            const value = parseInt(v.value || 0);
            totalFollows += value;
            return {
              date: v.end_time ? v.end_time.split('T')[0] : null,
              value: value
            };
          }).filter(v => v.date);
          processedData.total_follows = totalFollows;
        } else if (metricName === 'page_fan_removes') {
          let totalUnfollows = 0;
          processedData.fan_removes = values.map(v => {
            const value = parseInt(v.value || 0);
            totalUnfollows += value;
            return {
              date: v.end_time ? v.end_time.split('T')[0] : null,
              value: value
            };
          }).filter(v => v.date);
          processedData.total_unfollows = totalUnfollows;
        } else if (metricName === 'page_views') {
          let totalViews = 0;
          processedData.views = values.map(v => {
            const value = parseInt(v.value || 0);
            totalViews += value;
            return {
              date: v.end_time ? v.end_time.split('T')[0] : null,
              value
            };
          }).filter(v => v.date);
          processedData.total_views = totalViews;
        } else if (metricName === 'page_consumptions') {
          let totalInteractions = 0;
          processedData.interactions = values.map(v => {
            const value = parseInt(v.value || 0);
            totalInteractions += value;
            return {
              date: v.end_time ? v.end_time.split('T')[0] : null,
              value
            };
          }).filter(v => v.date);
          processedData.total_interactions = totalInteractions;
        }
      });
      
      return processedData;
    };
    
    // Fetch current period insights
    console.log(`[Page Insights] Fetching insights for page ${pageId} from ${since} to ${until}`);
    const { data } = await axios.get(insightsUrl, { params });
    
    // Meta API returns insights as an array of metric objects
    // Each metric has a name and values array with date/value pairs
    const insightsData = data.data || [];
    const processedData = processInsights(insightsData, `${since} to ${until}`);

    // Fetch previous period for change calculations
    const startDate = new Date(since);
    const endDate = new Date(until);
    const diffDays = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));
    const prevUntilDate = new Date(startDate);
    prevUntilDate.setDate(prevUntilDate.getDate() - 1);
    const prevSinceDate = new Date(prevUntilDate);
    prevSinceDate.setDate(prevSinceDate.getDate() - diffDays);
    const prevSince = prevSinceDate.toISOString().split('T')[0];
    const prevUntil = prevUntilDate.toISOString().split('T')[0];

    console.log(`[Page Insights] Totals:`, {
      total_follows: processedData.total_follows,
      total_unfollows: processedData.total_unfollows,
      total_reached: processedData.total_reached,
      total_views: processedData.total_views,
      total_interactions: processedData.total_interactions,
      current_followers: processedData.current_followers,
      current_reach: processedData.current_reach
    });
    
    console.log(`[Page Insights] Processed insights: ${processedData.followers.length} follower data points, ${processedData.reach.length} reach data points`);
    
    res.json({ data: processedData });
  } catch (err) {
    console.error("Error fetching page insights:", err.response?.data || err.message);
    
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }
    
    // Check for permission errors
    if (err.response?.data?.error?.code === 200) {
      return res.status(403).json({
        error: "Insufficient permissions",
        details: err.response.data.error.message,
        isPermissionError: true,
        instruction: "Please ensure your Meta Access Token has 'pages_read_engagement' permission"
      });
    }
    
    res.status(500).json({
      error: "Failed to fetch page insights",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 5.2.2) PRE-LOAD LEADS API - Pre-fetch all leads for a page in date range
//    GET /api/meta/leads/preload?pageId=...&start=...&end=...
//    
//    Pre-loads all forms and leads for a page in the specified date range.
//    Returns structured data with forms list and all leads including campaign_id and ad_id.
//    
//    Uses Page Access Token (META_PAGE_ACCESS_TOKEN or fetched from Meta API)
//    Page Access Token is required to get ad_id and campaign_id attribution data
// ---------------------------------------------------------------------
router.get("/leads/preload", optionalAuthMiddleware, async (req, res) => {
  try {
    const { pageId, start, end } = req.query;
    
    // Validate required parameters
    if (!pageId || pageId.trim() === "") {
      return res.status(400).json({
        error: "pageId parameter is required",
        message: "Please provide a pageId to pre-load leads"
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!start || !end || !dateRegex.test(start) || !dateRegex.test(end)) {
      return res.status(400).json({
        error: "start and end date parameters are required",
        message: "Please provide start and end dates in YYYY-MM-DD format"
      });
    }

    console.log(`[Pre-load] Pre-loading leads for page ${pageId} from ${start} to ${end}`);

    // Convert date range to Date objects
    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T23:59:59');
    
    // Fetch leads from Meta API using the scheduler function
    const allLeads = await fetchLeadsFromMeta(pageId, startDate, endDate);
    
    console.log(`[Pre-load] Fetched ${allLeads.length} leads from Meta API`);

    // Save leads to database (only those with ad_id and campaign_id)
    let savedCount = 0;
    if (allLeads.length > 0) {
      try {
        const result = await saveLeads(allLeads);
        savedCount = result.inserted + result.updated;
        console.log(`[Pre-load] Saved ${result.inserted} new leads, updated ${result.updated} existing leads to database`);
      } catch (dbError) {
        console.error('[Pre-load] Error saving leads to database:', dbError);
        return res.status(500).json({
          error: "Failed to save leads to database",
          details: dbError.message
        });
      }
    }

    // Return success response
    res.json({
      success: true,
      message: "Leads pre-loaded and saved to database",
      meta: {
        page_id: pageId,
        date_range: { start, end },
        total_leads_fetched: allLeads.length,
        total_leads_saved: savedCount
      }
    });
  } catch (err) {
    console.error("[Pre-load] Error:", err.response?.data || err.message);
    
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }

    // Check for permission errors
    if (err.response?.data?.error?.code === 200) {
      return res.status(403).json({
        error: "Insufficient permissions",
        details: err.response.data.error.message,
        isPermissionError: true,
        instruction: "Please ensure your Meta Access Token has 'leads_retrieval' permission"
      });
    }
    
    res.status(500).json({
      error: "Failed to pre-load leads",
      details: err.response?.data?.error?.message || err.message
    });
  }
});

// ---------------------------------------------------------------------
// 5.2.5) LEADS DATABASE API - Fetch leads from database filtered by campaign and ad
//    GET /api/meta/leads/db?campaignId=xxx&adId=xxx&formId=xxx&pageId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//    
//    Returns leads from database filtered by:
//    - campaignId (optional) - Filter by campaign ID
//    - adId (optional) - Filter by ad ID
//    - formId (optional) - Filter by form ID
//    - pageId (optional) - Filter by page ID
//    - startDate (optional) - Start date filter (YYYY-MM-DD)
//    - endDate (optional) - End date filter (YYYY-MM-DD)
//    
//    All leads returned have both ad_id and campaign_id (as per requirements)
// ---------------------------------------------------------------------
router.get("/leads/db", optionalAuthMiddleware, async (req, res) => {
  try {
    const { campaignId, adId, formId, pageId, startDate, endDate } = req.query;

    // Support multiple campaign/ad IDs (comma-separated or repeated params)
    const parseIds = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean).map(v => String(v));
      return String(val)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => String(v));
    };

    const campaignIds = parseIds(campaignId);
    const adIds = parseIds(adId);
    
    console.log('[Leads DB] Fetching leads from database with filters:', {
      campaignIds,
      adIds,
      formId,
      pageId,
      startDate,
      endDate
    });
    
    // Fetch leads from database
    const leads = await getLeadsByCampaignAndAd(campaignIds, adIds, startDate, endDate, formId, pageId);
    
    console.log(`[Leads DB] Found ${leads.length} leads in database`);
    
    // Enrich ad names from Meta API only for leads missing ad_name (legacy data)
    const adNameCache = {};
    const leadsNeedingAdEnrichment = leads.filter(lead => lead.ad_id && !lead.ad_name);
    const uniqueAdIds = [...new Set(leadsNeedingAdEnrichment.map(lead => lead.ad_id).filter(Boolean))];
    
    if (uniqueAdIds.length > 0) {
      console.log(`[Leads DB] Enriching ${uniqueAdIds.length} ad names from Meta API (for leads missing ad_name in DB)`);
      const accessToken = getSystemToken();
      
      // Fetch ad names in parallel (with rate limiting - batch of 10 at a time)
      const batchSize = 10;
      for (let i = 0; i < uniqueAdIds.length; i += batchSize) {
        const batch = uniqueAdIds.slice(i, i + batchSize);
        await Promise.all(batch.map(async (adIdValue) => {
          try {
            const adResponse = await axios.get(
              `https://graph.facebook.com/${META_API_VERSION}/${adIdValue}`,
              { 
                params: { access_token: accessToken, fields: "name" },
                timeout: 5000
              }
            );
            adNameCache[adIdValue] = adResponse.data.name || 'N/A';
          } catch (err) {
            console.warn(`[Leads DB] Could not fetch ad name for ${adIdValue}:`, err.response?.data?.error?.message || err.message);
            adNameCache[adIdValue] = 'N/A';
          }
        }));
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < uniqueAdIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } else {
      console.log(`[Leads DB] All leads have ad_name in database, no API enrichment needed`);
    }
    
    // Enrich form names from Meta API for all leads (form_name is not stored in DB)
    const formNameCache = {};
    const leadsNeedingFormEnrichment = leads.filter(lead => lead.form_id);
    const uniqueFormIds = [...new Set(leadsNeedingFormEnrichment.map(lead => lead.form_id).filter(Boolean))];
    
    if (uniqueFormIds.length > 0) {
      console.log(`[Leads DB] Enriching ${uniqueFormIds.length} form names from Meta API`);
      const accessToken = getSystemToken();
      
      // Fetch form names in parallel (with rate limiting - batch of 10 at a time)
      const batchSize = 10;
      for (let i = 0; i < uniqueFormIds.length; i += batchSize) {
        const batch = uniqueFormIds.slice(i, i + batchSize);
        await Promise.all(batch.map(async (formIdValue) => {
          try {
            const formResponse = await axios.get(
              `https://graph.facebook.com/${META_API_VERSION}/${formIdValue}`,
              { 
                params: { access_token: accessToken, fields: "name" },
                timeout: 5000
              }
            );
            formNameCache[formIdValue] = formResponse.data.name || 'N/A';
          } catch (err) {
            console.warn(`[Leads DB] Could not fetch form name for ${formIdValue}:`, err.response?.data?.error?.message || err.message);
            formNameCache[formIdValue] = 'N/A';
          }
        }));
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < uniqueFormIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } else {
      console.log(`[Leads DB] No form IDs found in leads, skipping form name enrichment`);
    }
    
    // Format response to match frontend expectations
    // Use stored ad_name from database, fallback to API enrichment if missing
    const formattedLeads = leads.map(lead => {
      let adName = lead.ad_name || null;
      
      // If ad_name is missing in DB but we have ad_id, try to get from API cache (for legacy data)
      if (!adName && lead.ad_id && adNameCache[lead.ad_id]) {
        adName = adNameCache[lead.ad_id];
      }
      
      // Get form name from API cache (form_name is not stored in DB)
      let formName = 'N/A';
      if (lead.form_id && formNameCache[lead.form_id]) {
        formName = formNameCache[lead.form_id];
      }
      
      return {
        Id: lead.Id,
        Name: lead.Name,
        Phone: lead.Phone,
        Time: lead.Time,
        TimeUtc: lead.TimeUtc,
        Date: lead.Date,
        DateChar: lead.DateChar,
        Campaign: lead.Campaign,
        campaign: lead.campaign,
        ad_id: lead.ad_id,
        campaign_id: lead.campaign_id,
        lead_id: lead.lead_id,
        form_id: lead.form_id,
        page_id: lead.page_id,
        created_time: lead.created_time,
        // Legacy compatibility fields
        name: lead.name,
        phone: lead.phone,
        date: lead.date,
        time: lead.time,
        // Additional fields that frontend might expect
        Street: 'N/A', // Not stored in DB currently, can be added later
        City: 'N/A', // Not stored in DB currently, can be added later
        page_name: 'N/A', // Can be enriched from Meta API if needed
        campaign_name: lead.Campaign || 'N/A',
        ad_name: adName || 'N/A', // Use stored ad_name from DB, fallback to API if missing
        form_name: formName // Enriched from Meta API
      };
    });
    
    if (Object.keys(adNameCache).length > 0) {
      console.log(`[Leads DB] Enriched ${Object.keys(adNameCache).length} ad names from API (legacy data)`);
    }
    
    if (Object.keys(formNameCache).length > 0) {
      console.log(`[Leads DB] Enriched ${Object.keys(formNameCache).length} form names from API`);
    }
    
    res.json({
      data: formattedLeads,
        meta: {
          total: formattedLeads.length,
          filters: {
            campaignId: campaignId || null,
            adId: adId || null,
            formId: formId || null,
            pageId: pageId || null,
            startDate: startDate || null,
            endDate: endDate || null
          }
        }
    });
  } catch (err) {
    console.error("[Leads DB] Error:", err.message);
    res.status(500).json({
      error: "Failed to fetch leads from database",
      details: err.message
    });
  }
});

// ---------------------------------------------------------------------
// 5.2.6) LEADS BACKFILL API - Manually backfill historical leads data
//    POST /api/meta/leads/backfill?pageId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&days=30
//    GET  /api/meta/leads/backfill?pageId=xxx&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&days=30
//    
//    Manually fetches leads from Meta API for a specified date range and saves them to database.
//    This is separate from the scheduled incremental sync and does NOT update JobState.
//    
//    Parameters:
//    - pageId (required) - Meta page ID
//    - startDate (optional) - Start date in YYYY-MM-DD format
//    - endDate (optional) - End date in YYYY-MM-DD format (defaults to today)
//    - days (optional) - Number of days to go back from today (alternative to startDate/endDate, defaults to 30)
//    
//    Returns:
//    - Success status
//    - Date range used
//    - Number of leads fetched, inserted, and updated
//    
//    Uses Page Access Token (META_PAGE_ACCESS_TOKEN or fetched from Meta API)
//    Page Access Token is required to get ad_id and campaign_id attribution data
// ---------------------------------------------------------------------
router.post("/leads/backfill", optionalAuthMiddleware, async (req, res) => {
  return handleBackfillRequest(req, res);
});

router.get("/leads/backfill", optionalAuthMiddleware, async (req, res) => {
  return handleBackfillRequest(req, res);
});

async function handleBackfillRequest(req, res) {
  try {
    const { pageId, startDate, endDate, days } = req.query;
    
    // Validate required parameters
    if (!pageId || pageId.trim() === "") {
      return res.status(400).json({
        error: "pageId parameter is required",
        message: "Please provide a pageId to backfill leads"
      });
    }

    // Calculate date range
    let startDateObj, endDateObj;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    if (days) {
      // Use days parameter
      const daysNum = parseInt(days, 10);
      if (isNaN(daysNum) || daysNum <= 0) {
        return res.status(400).json({
          error: "Invalid days parameter",
          message: "days must be a positive number"
        });
      }
      endDateObj = new Date();
      endDateObj.setHours(23, 59, 59, 999);
      startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - daysNum);
      startDateObj.setHours(0, 0, 0, 0);
    } else if (startDate && endDate) {
      // Use provided date range
      if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return res.status(400).json({
          error: "Invalid date format",
          message: "startDate and endDate must be in YYYY-MM-DD format"
        });
      }
      startDateObj = new Date(startDate + 'T00:00:00');
      endDateObj = new Date(endDate + 'T23:59:59');
    } else {
      // Default: last 30 days
      endDateObj = new Date();
      endDateObj.setHours(23, 59, 59, 999);
      startDateObj = new Date();
      startDateObj.setDate(startDateObj.getDate() - 30);
      startDateObj.setHours(0, 0, 0, 0);
    }

    // Validate date range
    if (startDateObj >= endDateObj) {
      return res.status(400).json({
        error: "Invalid date range",
        message: "startDate must be before endDate"
      });
    }

    const startDateStr = startDateObj.toISOString().split('T')[0];
    const endDateStr = endDateObj.toISOString().split('T')[0];

    console.log(`[Backfill] Starting manual backfill for page ${pageId} from ${startDateStr} to ${endDateStr}`);

    // Fetch leads from Meta API
    const allLeads = await fetchLeadsFromMeta(pageId, startDateObj, endDateObj);
    console.log(`[Backfill] Fetched ${allLeads.length} leads from Meta API`);

    // Save leads to database
    let result = { inserted: 0, updated: 0 };
    if (allLeads.length > 0) {
      try {
        result = await saveLeads(allLeads);
        console.log(`[Backfill] Saved ${result.inserted} new leads, updated ${result.updated} existing leads to database`);
      } catch (dbError) {
        console.error('[Backfill] Error saving leads to database:', dbError);
        return res.status(500).json({
          error: "Failed to save leads to database",
          details: dbError.message
        });
      }
    }

    // Return success response
    res.json({
      success: true,
      message: "Leads backfilled successfully",
      data: {
        pageId: pageId,
        dateRange: {
          start: startDateStr,
          end: endDateStr
        },
        stats: {
          leadsFetched: allLeads.length,
          leadsInserted: result.inserted,
          leadsUpdated: result.updated
        }
      }
    });
  } catch (err) {
    console.error("[Backfill] Error:", err.response?.data || err.message);
    
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }

    // Check for permission errors
    if (err.response?.data?.error?.code === 200) {
      return res.status(403).json({
        error: "Insufficient permissions",
        details: err.response.data.error.message,
        isPermissionError: true,
        instruction: "Please ensure your Meta Access Token has 'leads_retrieval' permission"
      });
    }
    
    res.status(500).json({
      error: "Failed to backfill leads",
      details: err.response?.data?.error?.message || err.message
    });
  }
}

// ---------------------------------------------------------------------
// 5.3) LEADS API - Fetch actual lead data from Meta Lead Ads
//    GET /api/meta/leads?formId=xxx&adId=xxx&campaignId=xxx&pageId=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
//    
//    Supports filtering by:
//    - formId (optional, but recommended) - Filter by specific form
//    - adId (optional) - Find forms for ad, then fetch leads
//    - campaignId (optional) - For context enrichment only
//    - pageId (optional) - Fetch all forms from page, then leads
//    - start/end (optional) - Date range filter
//    
//    Each lead is enriched with:
//    - page_name - Fetched from Meta API
//    - campaign_name - From Insights API context
//    - ad_name - From Insights API context  
//    - form_name - Fetched from Meta API
//    
//    Uses META_SYSTEM_ACCESS_TOKEN
// ---------------------------------------------------------------------
router.get("/leads", optionalAuthMiddleware, async (req, res) => {
  try {
    const accessToken = getSystemToken();
    const credentials = getCredentials();
    
    // Get all filter parameters
    const { formId, adId, campaignId, pageId, start, end, days, limit = 500 } = req.query;
    
    // At least one of formId, adId, or pageId must be provided
    if (!formId && !adId && !pageId) {
      return res.status(400).json({
        error: "At least one filter parameter is required",
        message: "Please provide formId, adId, or pageId to fetch leads"
      });
    }
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    let dateFrom = start;
    let dateTo = end;

    // Calculate date range
    if (!dateFrom || !dateTo || !dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      const daysToFetch = days ? parseInt(days, 10) : 30;
      const validDays = isNaN(daysToFetch) || daysToFetch <= 0 ? 30 : Math.min(daysToFetch, 365);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - (validDays - 1));
      
      dateFrom = startDate.toISOString().slice(0, 10);
      dateTo = endDate.toISOString().slice(0, 10);
      
      console.log(`[Leads API] Using date range: ${dateFrom} to ${dateTo}`);
    }

    // Check for pre-loaded data first (if pageId is provided and matches cache)
    if (pageId) {
      const preloadCacheKey = `preload_${pageId}_${dateFrom}_${dateTo}`;
      const now = Date.now();
      if (preloadLeadsCache.data[preloadCacheKey] && preloadLeadsCache.lastFetched[preloadCacheKey] &&
          (now - preloadLeadsCache.lastFetched[preloadCacheKey]) < preloadLeadsCache.ttl) {
        console.log(`[Leads API] Using pre-loaded leads data for page ${pageId}`);
        
        const preloadedData = preloadLeadsCache.data[preloadCacheKey];
        let filteredLeads = [...(preloadedData.leads || [])];
        
        // Apply filters from pre-loaded data
        if (formId) {
          filteredLeads = filteredLeads.filter(lead => lead.form_id === formId);
        }
        
        if (adId) {
          filteredLeads = filteredLeads.filter(lead => {
            if (!lead.ad_id) return false;
            return lead.ad_id === adId || lead.ad_id.toString() === adId.toString();
          });
        }
        
        if (campaignId) {
          filteredLeads = filteredLeads.filter(lead => {
            if (!lead.campaign_id) return false;
            return lead.campaign_id === campaignId || lead.campaign_id.toString() === campaignId.toString();
          });
        }
        
        // Date range is already filtered during pre-load, but double-check
        const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        
        filteredLeads = filteredLeads.filter(lead => {
          if (!lead.created_time) return false;
          const leadDate = new Date(lead.created_time);
          return leadDate >= startDate && leadDate <= endDate;
        });
        
        // Enrich with page_name, campaign_name, ad_name, form_name from cache
        const forms = preloadedData.forms || [];
        const enrichedLeads = await Promise.all(filteredLeads.map(async (lead) => {
          const enriched = { ...lead };
          
          // Get form name
          const form = forms.find(f => f.form_id === lead.form_id);
          enriched.form_name = form?.name || 'N/A';
          
          // Get page name
          try {
            const pageResponse = await axios.get(
              `https://graph.facebook.com/${META_API_VERSION}/${pageId}`,
              { params: { access_token: accessToken, fields: "name" } }
            );
            enriched.page_name = pageResponse.data.name || 'N/A';
          } catch (err) {
            enriched.page_name = 'N/A';
          }
          
          // Get campaign name if campaign_id exists
          if (lead.campaign_id) {
            try {
              const campaignResponse = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${lead.campaign_id}`,
                { params: { access_token: credentials.accessToken, fields: "name" } }
              );
              enriched.campaign_name = campaignResponse.data.name || 'N/A';
            } catch (err) {
              enriched.campaign_name = 'N/A';
            }
          } else {
            enriched.campaign_name = 'N/A';
          }
          
          // Get ad name if ad_id exists
          if (lead.ad_id) {
            try {
              const adResponse = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${lead.ad_id}`,
                { params: { access_token: credentials.accessToken, fields: "name" } }
              );
              enriched.ad_name = adResponse.data.name || 'N/A';
            } catch (err) {
              // Fallback: try Insights API
              try {
                let accountId = credentials.adAccountId;
                if (accountId && accountId.startsWith('act_')) {
                  accountId = accountId.substring(4);
                }
                const insightsResponse = await axios.get(
                  `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads`,
                  { 
                    params: { 
                      access_token: credentials.accessToken, 
                      fields: "id,name",
                      filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: [lead.ad_id] }])
                    } 
                  }
                );
                const ads = insightsResponse.data.data || [];
                enriched.ad_name = ads.length > 0 ? ads[0].name : 'N/A';
              } catch (insightsErr) {
                enriched.ad_name = 'N/A';
              }
            }
          } else {
            enriched.ad_name = 'N/A';
          }
          
          return enriched;
        }));
        
        // Apply limit if specified
        const limitedLeads = limit ? enrichedLeads.slice(0, parseInt(limit, 10)) : enrichedLeads;
        
        console.log(`[Leads API] Returning ${limitedLeads.length} filtered leads from pre-loaded data`);
        
        return res.json({
          data: limitedLeads,
          meta: {
            total_leads: enrichedLeads.length,
            returned: limitedLeads.length,
            fromPreload: true,
            cached: false
          }
        });
      }
    }

    // Step 1: Determine which forms to fetch leads from
    let formsToFetch = [];
    
    if (formId) {
      // Direct form ID provided
      // We need page_id to get the Page Access Token for fetching leads
      try {
        const formResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${formId}`,
          { params: { access_token: accessToken, fields: "id,name,page_id" } }
        );
        if (!formResponse.data.page_id) {
          return res.status(400).json({ 
            error: "Form missing page_id", 
            details: "Unable to determine which page this form belongs to. Cannot fetch leads without page_id." 
          });
        }
        formsToFetch.push({
          form_id: formId,
          name: formResponse.data.name || `Form ${formId}`,
          page_id: formResponse.data.page_id
        });
      } catch (err) {
        const errorData = err.response?.data?.error;
        const errorCode = errorData?.code;
        const errorMsg = errorData?.message || err.message;
        
        // Handle token errors
        if (errorCode === 190) {
          return res.status(401).json({ 
            error: "Meta Access Token expired or invalid", 
            details: errorMsg,
            isAuthError: true,
            instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
          });
        }
        
        if (errorCode === 200 || errorCode === 10) {
          return res.status(403).json({ 
            error: "Permission error", 
            details: errorMsg,
            instruction: "Ensure your System User Token has required permissions"
          });
        }
        
        console.error(`[Leads API] Error fetching form ${formId}:`, errorMsg);
        return res.status(400).json({ error: "Invalid formId", details: errorMsg });
      }
    } else if (adId) {
      // Fetch forms associated with ad - use same logic as /forms endpoint
      // Step 1: Verify ad has leads via Insights API
      let accountId = credentials.adAccountId;
      if (accountId && accountId.startsWith('act_')) {
        accountId = accountId.substring(4);
      }
      
      try {
        const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights`;
        const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
        
        const insightsResponse = await axios.get(insightsUrl, {
          params: {
            access_token: credentials.accessToken,
            level: "ad",
            fields: "ad_id,actions",
            filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: [adId] }]),
            time_range: timeRange,
            limit: 1
          }
        });
        
        const insightsData = insightsResponse.data.data || [];
        const hasLeads = insightsData.length > 0 && insightsData[0].actions?.some(
          action => action.action_type === 'lead' || action.action_type === 'onsite_conversion.lead_grouped'
        );
        
        if (!hasLeads) {
          console.log(`[Leads API] Ad ${adId} has no leads in date range`);
          return res.json({ data: [], meta: { total_leads: 0, message: "Ad has no leads in date range" } });
        }
        
        // Step 2: Fetch all forms from accessible pages
        const pagesResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/me/accounts`,
          { params: { access_token: accessToken, fields: "id", limit: 100 } }
        );
        const pages = (pagesResponse.data.data || []).map(p => p.id);
        
        // Step 3: Fetch all forms using Page Access Tokens
        // Meta's leadgen_forms API requires a Page Access Token, not a System User Token
        const formPromises = pages.map(async (pageId) => {
          try {
            const pageAccessToken = await getPageAccessToken(pageId);
            const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`, {
              params: { access_token: pageAccessToken, fields: "id,name,page_id", limit: 100 }
            });
            return (response.data.data || []).map(f => ({ 
              form_id: f.id, 
              name: f.name || `Form ${f.id}`,
              page_id: f.page_id || pageId 
            }));
          } catch (err) {
            const errorData = err.response?.data?.error;
            const errorCode = errorData?.code;
            
            // Handle token errors
            if (errorCode === 190) {
              if (pageTokenCache.tokens[pageId]) {
                delete pageTokenCache.tokens[pageId];
              }
              console.warn(`[Leads API] Token expired for page ${pageId}:`, errorData?.message || err.message);
            } else if (errorCode === 200 || errorCode === 10) {
              console.warn(`[Leads API] Permission error for page ${pageId}:`, errorData?.message || err.message);
            } else {
              console.warn(`[Leads API] Error fetching forms for page ${pageId}:`, err.message);
            }
            return [];
          }
        });
        
        const allFormsArrays = await Promise.all(formPromises);
        formsToFetch = allFormsArrays.flat();
        console.log(`[Leads API] Found ${formsToFetch.length} forms for ad ${adId}`);
      } catch (err) {
        console.error(`[Leads API] Error fetching forms for ad:`, err.message);
        formsToFetch = [];
      }
    } else if (pageId) {
      // Fetch all forms from page using Page Access Token
      // Meta's leadgen_forms API requires a Page Access Token, not a System User Token
      try {
        const pageAccessToken = await getPageAccessToken(pageId);
        const formsResponse = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`,
          { params: { access_token: pageAccessToken, fields: "id,name,page_id", limit: 100 } }
        );
        formsToFetch = (formsResponse.data.data || []).map(f => ({ 
          form_id: f.id, 
          name: f.name,
          page_id: f.page_id || pageId 
        }));
        console.log(`[Leads API] Found ${formsToFetch.length} forms for page ${pageId}`);
      } catch (err) {
        const errorData = err.response?.data?.error;
        const errorCode = errorData?.code;
        const errorMsg = errorData?.message || err.message;
        
        // Handle token errors
        if (errorCode === 190) {
          if (pageTokenCache.tokens[pageId]) {
            delete pageTokenCache.tokens[pageId];
          }
          return res.status(401).json({ 
            error: "Meta Access Token expired or invalid", 
            details: errorMsg,
            isAuthError: true,
            instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
          });
        }
        
        if (errorCode === 200 || errorCode === 10) {
          return res.status(403).json({ 
            error: "Permission error", 
            details: errorMsg,
            instruction: "Ensure your System User Token has 'leads_retrieval' and 'pages_read_engagement' permissions"
          });
        }
        
        console.error(`[Leads API] Error fetching forms for page:`, err.message);
        return res.status(400).json({ error: "Failed to fetch forms for page", details: errorMsg });
      }
    }

    if (formsToFetch.length === 0) {
      return res.json({ data: [], meta: { total_leads: 0, message: "No forms found for the specified filters" } });
    }

    // Step 2: Fetch leads from all identified forms
    let allLeads = [];
    const pageNameCache = {}; // Cache page names
    const formNameCache = {}; // Cache form names
    const adNameCache = {}; // Cache ad names
    const campaignNameCache = {}; // Cache campaign names

    for (const formInfo of formsToFetch) {
      try {
        // Meta's /leads API requires a Page Access Token for the form's page
        const formPageId = formInfo.page_id;
        if (!formPageId) {
          console.warn(`[Leads API] Form ${formInfo.form_id} has no page_id, skipping`);
          continue;
        }
        
        const pageAccessToken = await getPageAccessToken(formPageId);
        const leadsUrl = `https://graph.facebook.com/${META_API_VERSION}/${formInfo.form_id}/leads`;
        // Request ad_id field if available in Meta API
        const response = await axios.get(leadsUrl, {
          headers: { Authorization: `Bearer ${pageAccessToken}` },
          params: {
            fields: "id,created_time,field_data,ad_id" // Try to get ad_id if available
          }
        });
        
        const leads = response.data.data || [];
        console.log(`[Leads API] Found ${leads.length} leads in form ${formInfo.form_id}`);

        // Process each lead
        for (const lead of leads) {
          // Check if lead should be included based on adId filter (if provided)
          // Meta Leads API may include ad_id in the lead object
          if (adId && lead.ad_id && lead.ad_id !== adId) {
            continue; // Skip leads that don't match the requested adId
          }
          
          // Parse field_data
          const fieldData = {};
          if (Array.isArray(lead.field_data)) {
            lead.field_data.forEach(field => {
              const fieldName = field.name || '';
              const fieldValue = field.values ? (Array.isArray(field.values) ? field.values[0] : field.values) : '';
              fieldData[fieldName.toLowerCase()] = fieldValue;
              fieldData[fieldName] = fieldValue;
            });
          }

          // Extract name
          let leadName = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (key && typeof key === 'string' && 
                (key.toLowerCase().includes('name') || key.includes('பெயர்')) && 
                value && value.trim() !== '') {
              leadName = value;
              break;
            }
          }
          if (leadName === 'N/A') {
            leadName = fieldData.full_name || 
                      `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() || 
                      fieldData.name || 'N/A';
          }

          // Extract phone
          let phone = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (key && typeof key === 'string' && 
                (key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) && 
                value && value.trim() !== '') {
              phone = value.toString();
              break;
            }
          }
          if (phone === 'N/A') {
            phone = fieldData.phone_number || fieldData.phone || fieldData.mobile_number || 'N/A';
          }

          // Extract address
          let street = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (key && typeof key === 'string' && 
                (key.toLowerCase().includes('street') || key.toLowerCase().includes('address')) && 
                value && value.trim() !== '') {
              street = value.toString();
              break;
            }
          }
          if (street === 'N/A') {
            street = fieldData.street_address || fieldData.address || fieldData.street || 'N/A';
          }
          const city = fieldData.city || 'N/A';

          // Get form name (from cache or fetch)
          let formName = formNameCache[formInfo.form_id] || formInfo.name;
          if (!formNameCache[formInfo.form_id]) {
            formNameCache[formInfo.form_id] = formName;
          }

          // Get page name if pageId provided
          let pageName = null;
          if (pageId && !pageNameCache[pageId]) {
            try {
              const pageResponse = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${pageId}`,
                { params: { access_token: accessToken, fields: "name" } }
              );
              pageName = pageResponse.data.name;
              pageNameCache[pageId] = pageName;
            } catch (err) {
              console.warn(`[Leads API] Could not fetch page name for ${pageId}`);
            }
          } else if (pageId) {
            pageName = pageNameCache[pageId];
          }

          // Get ad name if adId provided
          // Try to get from Insights API first (more reliable), fallback to direct ad fetch
          let adName = null;
          if (adId && !adNameCache[adId]) {
            // First, try to get ad name from cached ads list if available
            // Otherwise, try Insights API or direct ad fetch
            try {
              // Try direct ad fetch first
              const adResponse = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
                { params: { access_token: credentials.accessToken, fields: "name" } }
              );
              adName = adResponse.data.name;
              adNameCache[adId] = adName;
            } catch (err) {
              // If direct fetch fails, try to get from Insights API (if we have account ID)
              console.warn(`[Leads API] Could not fetch ad name directly for ${adId}, trying Insights API`);
              try {
                let accountId = credentials.adAccountId;
                if (accountId && accountId.startsWith('act_')) {
                  accountId = accountId.substring(4);
                }
                const insightsResponse = await axios.get(
                  `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/insights`,
                  {
                    params: {
                      access_token: credentials.accessToken,
                      level: "ad",
                      fields: "ad_id,ad_name",
                      filtering: JSON.stringify([{ field: "ad.id", operator: "IN", value: [adId] }]),
                      limit: 1
                    }
                  }
                );
                const insightsData = insightsResponse.data.data || [];
                if (insightsData.length > 0 && insightsData[0].ad_name) {
                  adName = insightsData[0].ad_name;
                  adNameCache[adId] = adName;
                }
              } catch (insightsErr) {
                console.warn(`[Leads API] Could not fetch ad name for ${adId} from Insights API either`);
              }
            }
          } else if (adId) {
            adName = adNameCache[adId];
          }

          // Get campaign name if campaignId provided
          let campaignName = null;
          if (campaignId && !campaignNameCache[campaignId]) {
            try {
              const campaignResponse = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
                { params: { access_token: credentials.accessToken, fields: "name" } }
              );
              campaignName = campaignResponse.data.name;
              campaignNameCache[campaignId] = campaignName;
            } catch (err) {
              console.warn(`[Leads API] Could not fetch campaign name for ${campaignId}`);
            }
          } else if (campaignId) {
            campaignName = campaignNameCache[campaignId];
          }

          // Build lead object
          const mappedLead = {
            lead_id: lead.id,
            form_id: formInfo.form_id,
            created_time: lead.created_time,
            name: leadName,
            phone: phone,
            email: fieldData.email || null,
            address: street, // Using 'address' as specified in requirements
            city: city,
            street: street, // Keep for backward compatibility
            page_name: pageName || null,
            campaign_name: campaignName || null,
            ad_name: adName || null,
            form_name: formName,
            // Include ad_id if available in lead object
            ad_id: lead.ad_id || (adId || null), // Use adId from filter if lead doesn't have it
            // Legacy fields
            Id: lead.id,
            Name: leadName,
            Phone: phone,
            Email: fieldData.email || 'N/A',
            Date: lead.created_time ? lead.created_time.split('T')[0] : '',
            Time: lead.created_time || '',
            TimeUtc: lead.created_time || '',
            DateChar: lead.created_time ? lead.created_time.split('T')[0] : '',
            Street: street,
            City: city,
            raw_field_data: lead.field_data || [],
            field_data: fieldData
          };

          allLeads.push(mappedLead);
        }
      } catch (formError) {
        const errorData = formError.response?.data?.error;
        const errorCode = errorData?.code;
        const errorMsg = errorData?.message || formError.message;
        
        // Handle token errors
        if (errorCode === 190) {
          // Clear cache for this page
          const formPageId = formInfo.page_id;
          if (formPageId && pageTokenCache.tokens[formPageId]) {
            delete pageTokenCache.tokens[formPageId];
          }
          console.error(`[Leads API] Token expired while fetching leads from form ${formInfo.form_id}:`, errorMsg);
        } else if (errorCode === 200 || errorCode === 10) {
          console.error(`[Leads API] Permission error while fetching leads from form ${formInfo.form_id}:`, errorMsg);
        } else {
          console.error(`[Leads API] Error fetching leads from form ${formInfo.form_id}:`, errorMsg);
        }
        // Continue with other forms
      }
    }

    // Step 3: Filter by date range
    let filteredLeads = allLeads;
    if (dateFrom && dateTo && dateRegex.test(dateFrom) && dateRegex.test(dateTo)) {
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      
      filteredLeads = allLeads.filter(lead => {
        if (!lead.created_time) return false;
        const leadDate = new Date(lead.created_time);
        return leadDate >= startDate && leadDate <= endDate;
      });
      
      console.log(`[Leads API] Filtered to ${filteredLeads.length} leads in date range`);
    }

    // Step 4: Apply additional filters
    // Filter by formId if specified
    if (formId) {
      filteredLeads = filteredLeads.filter(lead => lead.form_id === formId);
    }
    
    // Filter by adId if specified (check if lead has ad_id field)
    if (adId) {
      // Meta Leads API may or may not provide ad_id - filter if available
      filteredLeads = filteredLeads.filter(lead => {
        // Check if lead has ad_id field (from Meta API or added during processing)
        return lead.ad_id === adId || lead.ad_id === adId.toString();
      });
      
      // If no leads match after adId filter, the ad might not have attributed leads
      if (filteredLeads.length === 0) {
        console.log(`[Leads API] No leads found with ad_id=${adId}`);
      }
    }
    
    // Note: pageId filtering is already handled in Step 1 (we only fetch forms from that page)

    // Step 5: Sort and limit
    filteredLeads.sort((a, b) => {
      const timeA = new Date(a.created_time || 0).getTime();
      const timeB = new Date(b.created_time || 0).getTime();
      return timeB - timeA;
    });

    const leadLimit = Math.min(parseInt(limit, 10) || 500, 5000);
    if (filteredLeads.length > leadLimit) {
      filteredLeads = filteredLeads.slice(0, leadLimit);
    }

    res.json({ 
      data: filteredLeads,
      meta: {
        total_leads: filteredLeads.length,
        date_range: dateFrom && dateTo ? { from: dateFrom, to: dateTo } : null,
        filters: {
          formId: formId || null,
          adId: adId || null,
          campaignId: campaignId || null,
          pageId: pageId || null
        }
      }
    });
  } catch (err) {
    console.error("[Leads API] Error:", err.response?.data || err.message);

    const errorData = err.response?.data?.error;
    const errorCode = errorData?.code;
    const errorMsg = errorData?.message || err.message;

    // Handle token expiration (190)
    if (errorCode === 190) {
      // Clear all page token caches on token expiration
      pageTokenCache.tokens = {};
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: errorMsg,
        isAuthError: true,
        instruction: "Please update META_SYSTEM_ACCESS_TOKEN in server/.env"
      });
    }

    // Handle permission errors (200, 10)
    if (errorCode === 200) {
      return res.status(403).json({
        error: "Permission error",
        details: errorMsg,
        instruction: "Ensure your System User Token has 'leads_retrieval' and 'pages_read_engagement' permissions"
      });
    }

    if (errorCode === 10) {
      return res.status(403).json({
        error: "Permission denied",
        details: errorMsg,
        instruction: "Check that your System User Token has access to the requested resources and required permissions"
      });
    }

    const errorMessage = errorMsg;
    
    if (errorCode === 10 || errorCode === 200 || 
        errorMessage.toLowerCase().includes('permission') ||
        errorMessage.toLowerCase().includes('leads_retrieval')) {
      return res.status(403).json({
        error: "Insufficient permissions to fetch leads",
        details: errorMessage,
        isPermissionError: true,
        errorCode: errorCode
      });
    }

    res.status(500).json({
      error: "Failed to fetch leads",
      details: err.response?.data || err.message,
      errorCode: errorCode
    });
  }
});

// ---------------------------------------------------------------------
// 5.4) LEADS WITH CONTEXT - Contextual join of Leads + Insights
//    GET /api/meta/leads-with-context
//    
//    This endpoint implements a CONTEXTUAL (not relational) join of:
//    A. Leads API data (individual lead records)
//    B. Insights API data (aggregated campaign/ad metrics)
//    
//    JOIN STRATEGY:
//    - Join is STATISTICAL, not per-lead attribution
//    - Matching keys: Date window + Campaign/Ad filter context
//    - NEVER assumes one lead = one ad
//    
//    RESPONSE:
//    - Leads array (NO ad_id/campaign_id per lead)
//    - Context metadata (campaign/ad names from filters)
//    - Insights summary (aggregated metrics for context)
//    
//    IMPORTANT: This join does NOT add attribution to leads.
//    Campaign/Ad info is provided as UI context based on filters only.
// ---------------------------------------------------------------------
router.get("/leads-with-context", optionalAuthMiddleware, async (req, res) => {
  try {
    const {
      form_id,           // Required: form to fetch leads from
      from,              // Optional: start date (YYYY-MM-DD), defaults to 30 days ago
      to,                // Optional: end date (YYYY-MM-DD), defaults to today
      ad_account_id,     // Optional: filter insights by ad account
      campaign_id,       // Optional: filter insights by campaign (context only)
      ad_id,             // Optional: filter insights by ad (context only)
      limit = 500        // Optional: max leads to return
    } = req.query;
    
    // form_id is now optional when ad_id is provided
    // If ad_id is provided without form_id, we'll fetch leads from all forms
    // If both are provided, filter by the specific form
    if (!form_id && !ad_id) {
      return res.status(400).json({
        error: "Either form_id or ad_id parameter is required"
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    // Calculate date range: prioritize explicit from/to, then default to 30 days
    // Trim and normalize empty strings to undefined
    let dateFrom = from && typeof from === 'string' && from.trim() ? from.trim() : undefined;
    let dateTo = to && typeof to === 'string' && to.trim() ? to.trim() : undefined;

    if (!dateFrom || !dateTo || !dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
      // Default to last 30 days when dates are not provided or invalid
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 29); // Include today (30 days total)
      
      dateFrom = startDate.toISOString().slice(0, 10);
      dateTo = endDate.toISOString().slice(0, 10);
      
      console.log(`[Leads-With-Context] No explicit date range provided, using last 30 days (${dateFrom} to ${dateTo})`);
    }

    console.log(`[Leads-With-Context] Fetching leads for form ${form_id} from ${dateFrom} to ${dateTo}`);

    // STEP 1: Fetch leads from Meta Leads API
    // This returns only: created_time, id, field_data
    // Does NOT return: ad_id, campaign_id, ad_name, campaign_name
    
    const accessToken = getSystemToken();
    const formLeadsUrl = `https://graph.facebook.com/${META_API_VERSION}/${form_id}/leads`;
    
    let leadsData = [];
    try {
      // Pagination setup to fetch ALL leads
      let allRawLeads = [];
      let nextUrl = null;
      let currentParams = {};
      let pageCount = 0;
      const maxPages = 50; // Safety limit to prevent infinite loops
      
      do {
        // First page - add limit parameter, subsequent pages use after cursor
        if (!nextUrl) {
          currentParams.limit = 1000; // Max allowed by Meta API per request
        }
        
        const leadsResponse = await axios.get(formLeadsUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          params: Object.keys(currentParams).length > 0 ? currentParams : undefined
        });
        
        const responseData = leadsResponse.data;
        const leads = responseData.data || [];
        allRawLeads = allRawLeads.concat(leads);
        console.log(`[Leads-With-Context] Fetched page ${pageCount + 1}: ${leads.length} leads (total so far: ${allRawLeads.length})`);
        
        // Check for next page
        if (responseData.paging && responseData.paging.next) {
          nextUrl = responseData.paging.next;
          // Extract cursor from next URL for next request
          const urlObj = new URL(responseData.paging.next);
          currentParams.after = urlObj.searchParams.get('after');
          // Remove limit for subsequent pages (it's in the URL already)
          delete currentParams.limit;
          pageCount++;
        } else {
          nextUrl = null;
        }
      } while (nextUrl && pageCount < maxPages);
      
      const rawLeads = allRawLeads;
      console.log(`[Leads-With-Context] Fetched ${rawLeads.length} total raw leads from Meta API across ${pageCount + 1} page(s)`);
      
      // Process and filter leads by date
      const startDate = new Date(dateFrom);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateTo);
      endDate.setHours(23, 59, 59, 999);
      
      const processedLeads = rawLeads
        .filter(lead => {
          if (!lead.created_time) return false;
          const leadDate = new Date(lead.created_time);
          return leadDate >= startDate && leadDate <= endDate;
        })
        .map(lead => {
          // Extract field_data
          const fieldData = {};
          if (Array.isArray(lead.field_data)) {
            lead.field_data.forEach(field => {
              const fieldName = field.name || '';
              const fieldValue = field.values ? (Array.isArray(field.values) ? field.values[0] : field.values) : '';
              fieldData[fieldName.toLowerCase()] = fieldValue;
              fieldData[fieldName] = fieldValue;
            });
          }
          
          // Extract name
          let leadName = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (key && typeof key === 'string' && 
                (key.toLowerCase().includes('name') || key.includes('பெயர்')) && 
                value && value.trim() !== '') {
              leadName = value;
              break;
            }
          }
          if (leadName === 'N/A') {
            leadName = fieldData.full_name || 
                      `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() || 
                      fieldData.name || 'N/A';
          }
          
          // Extract phone
          let phone = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (key && typeof key === 'string' && 
                (key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) && 
                value && value.trim() !== '') {
              phone = value.toString();
              break;
            }
          }
          if (phone === 'N/A') {
            phone = fieldData.phone_number || fieldData.phone || fieldData.mobile_number || 'N/A';
          }
          
          return {
            lead_id: lead.id,
            form_id: form_id,
            created_time: lead.created_time,
            name: leadName,
            phone: phone,
            email: fieldData.email || null,
            city: fieldData.city || 'N/A',
            street: fieldData.street_address || fieldData.address || fieldData.street || 'N/A',
            raw_field_data: lead.field_data || [],
            // Legacy date fields for frontend compatibility
            Date: lead.created_time ? lead.created_time.split('T')[0] : '',
            Time: lead.created_time || '',
            TimeUtc: lead.created_time || '',
            DateChar: lead.created_time ? lead.created_time.split('T')[0] : '',
            // Capitalized field names for backward compatibility
            Name: leadName,
            Phone: phone,
            // NOTE: NO ad_id, campaign_id, ad_name, campaign_name
            // Meta API does not provide these per lead
          };
        })
        .sort((a, b) => new Date(b.created_time) - new Date(a.created_time));
      
      // Only apply limit if explicitly provided and greater than 0
      // Otherwise return all filtered leads
      if (limit && parseInt(limit, 10) > 0) {
        leadsData = processedLeads.slice(0, Math.min(parseInt(limit, 10), 50000)); // Max 50k for safety
      } else {
        leadsData = processedLeads; // Return all leads if no limit specified
      }
      console.log(`[Leads-With-Context] Processed ${leadsData.length} leads within date range`);
    } catch (leadsError) {
      console.error(`[Leads-With-Context] Error fetching leads:`, leadsError.response?.data || leadsError.message);
      // Continue even if leads fetch fails - return empty leads with insights context
      leadsData = [];
    }

    // STEP 2: Fetch insights from Meta Insights API
    // This provides aggregated metrics at ad/campaign level
    // Used for CONTEXT only, not per-lead attribution
    console.log(`[Leads-With-Context] Fetching insights context...`);
    
    let insightsContext = {
      campaign_name: null,
      ad_name: null,
      total_leads_from_insights: 0,
      total_spend: 0,
      date_range: { from: dateFrom, to: dateTo },
      filters_applied: {
        ad_account_id: ad_account_id || null,
        campaign_id: campaign_id || null,
        ad_id: ad_id || null
      }
    };

    try {
      // Get credentials for insights API
      const credentials = getCredentials();
      let adAccountId = ad_account_id || credentials.adAccountId;
      if (adAccountId && adAccountId.startsWith('act_')) {
        adAccountId = adAccountId.substring(4);
      }

      const insightsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/insights`;
      const timeRange = JSON.stringify({ since: dateFrom, until: dateTo });
      
      // Fetch at AD level to get both campaign and ad information
      const params = {
        access_token: credentials.accessToken,
        level: "ad",
        fields: "campaign_id,campaign_name,ad_id,ad_name,actions,spend,date_start",
        time_range: timeRange,
        limit: 1000
      };

      // Apply filters if provided
      const filtering = [];
      if (campaign_id && campaign_id.trim() !== "") {
        filtering.push({
          field: "campaign.id",
          operator: "IN",
          value: [campaign_id]
        });
      }
      if (ad_id && ad_id.trim() !== "") {
        filtering.push({
          field: "ad.id",
          operator: "IN",
          value: [ad_id]
        });
      }
      if (filtering.length > 0) {
        params.filtering = JSON.stringify(filtering);
      }

      const insightsResponse = await axios.get(insightsUrl, { params });
      const insightsRows = insightsResponse.data.data || [];
      
      console.log(`[Leads-With-Context] Fetched ${insightsRows.length} insights rows`);

      // Aggregate insights to extract context
      let totalLeads = 0;
      let totalSpend = 0;
      const campaignNames = new Set();
      const adNames = new Set();

      insightsRows.forEach(row => {
        // Extract leads count from actions
        if (Array.isArray(row.actions)) {
          row.actions.forEach(action => {
            if (action.action_type === 'lead' || 
                action.action_type === 'leads' ||
                action.action_type === 'onsite_conversion.lead_grouped') {
              totalLeads += parseFloat(action.value || 0) || 0;
            }
          });
        }

        totalSpend += parseFloat(row.spend || 0) || 0;
        
        if (row.campaign_name) campaignNames.add(row.campaign_name);
        if (row.ad_name) adNames.add(row.ad_name);
      });

      insightsContext.total_leads_from_insights = totalLeads;
      insightsContext.total_spend = totalSpend;
      
      // Prioritize showing campaign name when single campaign is selected
      if (campaign_id && campaign_id.trim() !== "" && insightsRows.length > 0) {
        // Find the campaign that matches the selected campaign_id
        const matchingCampaign = insightsRows.find(row => row.campaign_id === campaign_id || row.campaign_id?.toString() === campaign_id.toString());
        if (matchingCampaign && matchingCampaign.campaign_name) {
          insightsContext.campaign_name = matchingCampaign.campaign_name;
        } else if (campaignNames.size === 1) {
          insightsContext.campaign_name = Array.from(campaignNames)[0];
        } else if (campaignNames.size > 1) {
          insightsContext.campaign_name = `${campaignNames.size} Campaigns`;
        } else {
          insightsContext.campaign_name = null;
        }
      } else {
        // No specific campaign filter - use aggregation logic
        insightsContext.campaign_name = campaignNames.size === 1 ? Array.from(campaignNames)[0] : 
                                        campaignNames.size > 1 ? `${campaignNames.size} Campaigns` : 
                                        null;
      }
      
      // Prioritize showing ad name when single ad is selected
      if (ad_id && ad_id.trim() !== "" && insightsRows.length > 0) {
        // Find the ad that matches the selected ad_id
        const matchingAd = insightsRows.find(row => row.ad_id === ad_id || row.ad_id?.toString() === ad_id.toString());
        if (matchingAd && matchingAd.ad_name) {
          insightsContext.ad_name = matchingAd.ad_name;
        } else if (adNames.size === 1) {
          insightsContext.ad_name = Array.from(adNames)[0];
        } else if (adNames.size > 1) {
          insightsContext.ad_name = `${adNames.size} Ads`;
        } else {
          insightsContext.ad_name = null;
        }
      } else {
        // No specific ad filter - use aggregation logic
        insightsContext.ad_name = adNames.size === 1 ? Array.from(adNames)[0] : 
                                  adNames.size > 1 ? `${adNames.size} Ads` : 
                                  null;
      }

      console.log(`[Leads-With-Context] Insights context: ${insightsContext.campaign_name || 'No campaign'}, ${totalLeads} leads, ₹${totalSpend} spend`);
    } catch (insightsError) {
      console.error(`[Leads-With-Context] Error fetching insights:`, insightsError.response?.data || insightsError.message);
      // Continue even if insights fetch fails - return leads without context
    }

    // STEP 3: Return leads with contextual metadata
    // IMPORTANT: Leads array does NOT contain ad_id/campaign_id
    // Context is provided separately for UI display only
    res.json({
      leads: leadsData,
      context: insightsContext,
      meta: {
        leads_count: leadsData.length,
        date_range: { from, to },
        form_id: form_id,
        attribution_note: "Meta Graph API does not provide per-lead ad/campaign attribution. Campaign/Ad information shown is based on filter context and aggregated insights, not individual lead attribution."
      }
    });
  } catch (err) {
    console.error("[Leads-With-Context] Error:", err.response?.data || err.message);
    
    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true
      });
    }

    res.status(500).json({
      error: "Failed to fetch leads with context",
      details: err.response?.data || err.message
    });
  }
});

// ---------------------------------------------------------------------
// 6) FILTERED ADS API
//    POST /api/meta/ads/filtered
//    Body: { selectedCampaignIds: string[], selectedAdIds: string[] }
// ---------------------------------------------------------------------
router.post("/ads/filtered", optionalAuthMiddleware, async (req, res) => {
  try {
    const credentials = getCredentials();
    const { selectedCampaignIds = [], selectedAdIds = [] } = req.body;

    // Ensure arrays
    const campaignIds = Array.isArray(selectedCampaignIds) ? selectedCampaignIds : [];
    const adIds = Array.isArray(selectedAdIds) ? selectedAdIds : [];

    // Fetch all ads (from cache or API)
    const now = Date.now();
    let allAds = [];

    if (adsCache.data.length > 0 && adsCache.lastFetched && (now - adsCache.lastFetched) < adsCache.ttl) {
      console.log("Using cached ads for filtering");
      allAds = adsCache.data;
    } else {
      // Fetch fresh data
      const adsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${credentials.adAccountId}/ads`;
      const { data } = await axios.get(adsUrl, {
        params: {
          access_token: credentials.accessToken,
          fields: "id,name,status,effective_status,campaign_id",
          limit: 1000,
        },
      });

      let ads = data.data || [];

      // Fetch campaign names
      const campaignIdsFromAds = [...new Set(ads.map(ad => ad.campaign_id).filter(Boolean))];
      const campaignsMap = new Map();
      
      if (campaignIdsFromAds.length > 0) {
        try {
          const campaignsUrl = `https://graph.facebook.com/${META_API_VERSION}/act_${credentials.adAccountId}/campaigns`;
          const campaignsResp = await axios.get(campaignsUrl, {
            params: {
              access_token: credentials.accessToken,
              fields: "id,name",
              limit: 1000,
            },
          });
          
          (campaignsResp.data.data || []).forEach(campaign => {
            campaignsMap.set(campaign.id, campaign.name);
          });
        } catch (campaignErr) {
          console.warn("Error fetching campaign names:", campaignErr.message);
        }
      }

      // Enrich ads with campaign name
      allAds = ads.map(ad => ({
        id: ad.id,
        name: ad.name,
        status: ad.status,
        effective_status: ad.effective_status,
        campaign_id: ad.campaign_id,
        campaign_name: campaignsMap.get(ad.campaign_id) || null,
      }));

      // Update cache
      adsCache.data = allAds;
      adsCache.lastFetched = now;
    }

    // Apply filtering logic
    let filteredAds = allAds;

    // Filter by campaigns
    if (campaignIds.length > 0 && !campaignIds.includes("ALL")) {
      filteredAds = filteredAds.filter(ad => 
        ad.campaign_id && campaignIds.includes(ad.campaign_id)
      );
    }

    // Filter by ads
    if (adIds.length > 0 && !adIds.includes("ALL")) {
      filteredAds = filteredAds.filter(ad => 
        adIds.includes(ad.id)
      );
    }

    res.json({
      data: filteredAds,
      total: filteredAds.length,
      filters: {
        campaigns: campaignIds.includes("ALL") ? "ALL" : campaignIds,
        ads: adIds.includes("ALL") ? "ALL" : adIds,
      }
    });

  } catch (err) {
    console.error("Meta API Filtered Ads Error:", err.response?.data || err.message);

    if (err.response?.data?.error?.code === 190) {
      return res.status(401).json({
        error: "Meta Access Token expired or invalid",
        details: err.response.data.error.message,
        isAuthError: true,
        instruction: "Please update META_ACCESS_TOKEN in server/.env"
      });
    }

    res.status(500).json({
      error: "Failed to fetch filtered ads",
      details: err.response?.data || err.message,
    });
  }
});

// ---------------------------------------------------------------------
// 7) CLEAR CACHE API (for testing/debugging)
//    POST /api/meta/cache/clear
// ---------------------------------------------------------------------
router.post("/cache/clear", optionalAuthMiddleware, (req, res) => {
  campaignsCache = { data: [], lastFetched: null, ttl: 5 * 60 * 1000 };
  adsCache = { data: [], lastFetched: null, ttl: 5 * 60 * 1000 };
  res.json({ success: true, message: "Cache cleared" });
});

module.exports = router;
