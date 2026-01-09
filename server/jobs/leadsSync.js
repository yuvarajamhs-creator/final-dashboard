// server/jobs/leadsSync.js
const axios = require('axios');
const { saveLeads } = require('../repositories/leadsRepository');
const { getJobState, setJobState } = require('../repositories/jobStateRepository');

const META_API_VERSION = "v24.0"; // Using v24.0 as specified in user's API

const JOBSTATE_LAST_LEADS_SYNC_KEY = 'lastSuccessfulLeadsSyncUtc';

/**
 * Get system access token
 */
function getSystemToken() {
  const systemToken = process.env.META_SYSTEM_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  if (!systemToken) {
    throw new Error("Meta System Access Token missing. Please configure it in Settings.");
  }
  return systemToken;
}

/**
 * Get page access token for a specific page
 * Page Access Token is required to get ad_id and campaign_id in leads responses
 * 
 * @param {string} pageId - The Meta page ID
 * @returns {Promise<string>} - The page access token
 */
async function getPageAccessToken(pageId) {
  // Option 1: Direct configuration via environment variable
  if (process.env.META_PAGE_ACCESS_TOKEN) {
    console.log('[LeadsSync] Using META_PAGE_ACCESS_TOKEN from environment');
    return process.env.META_PAGE_ACCESS_TOKEN;
  }
  
  // Option 2: Fetch from Meta API using system token
  try {
    console.log(`[LeadsSync] Fetching page access token for page ${pageId} from Meta API`);
    const systemToken = getSystemToken();
    const response = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/${pageId}`,
      {
        params: { 
          fields: 'access_token',
          access_token: systemToken 
        },
        timeout: 30000,
      }
    );
    
    if (!response.data || !response.data.access_token) {
      throw new Error(`Page access token not found in API response for page ${pageId}`);
    }
    
    console.log('[LeadsSync] Successfully retrieved page access token from Meta API');
    return response.data.access_token;
  } catch (error) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error(`[LeadsSync] Failed to fetch page access token: ${errorMsg}`);
    throw new Error(`Failed to get page access token for page ${pageId}: ${errorMsg}. Please configure META_PAGE_ACCESS_TOKEN in environment or ensure your system token has 'pages_show_list' permission.`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert UTC time to Indian Standard Time (IST = UTC+5:30)
 * Returns time in IST as ISO string format for database storage
 * @param {string|Date} utcTime - UTC time string or Date object
 * @returns {string} - IST time in ISO string format (YYYY-MM-DDTHH:mm:ss.sssZ format, but represents IST time)
 */
function convertUTCToIST(utcTime) {
  if (!utcTime) return null;
  
  try {
    const date = new Date(utcTime);
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // IST is UTC+5:30 (5 hours 30 minutes = 5.5 * 60 * 60 * 1000 milliseconds)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffset);
    
    // Return in ISO format - this represents IST time but in ISO format
    // The database will store this as the actual datetime value
    return istDate.toISOString();
  } catch (e) {
    console.warn(`[LeadsSync] Error converting UTC to IST: ${utcTime}`, e.message);
    return null;
  }
}

/**
 * Get date string in IST timezone (YYYY-MM-DD format)
 * @param {string|Date} utcTime - UTC time string or Date object
 * @returns {string} - Date string in IST timezone
 */
function getISTDateString(utcTime) {
  if (!utcTime) return '';
  
  try {
    const date = new Date(utcTime);
    if (isNaN(date.getTime())) {
      return '';
    }
    
    // IST is UTC+5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + istOffset);
    
    // Return YYYY-MM-DD format
    return istDate.toISOString().split('T')[0];
  } catch (e) {
    console.warn(`[LeadsSync] Error getting IST date string: ${utcTime}`, e.message);
    return '';
  }
}

function isRetryableGraphErrorCode(code) {
  // Common Meta throttling / transient codes
  // 4: Application request limit reached
  // 17: User request limit reached
  // 32: Page request limit reached
  // 613: Calls to this api have exceeded the rate limit
  return code === 4 || code === 17 || code === 32 || code === 613;
}

async function postGraphBatch(accessToken, batch, attempt = 0) {
  const url = `https://graph.facebook.com/${META_API_VERSION}/`;

  // Batch API expects form-urlencoded payload
  const body = new URLSearchParams();
  body.append('access_token', accessToken);
  body.append('batch', JSON.stringify(batch));

  try {
    const resp = await axios.post(url, body.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 60000,
    });
    return resp.data;
  } catch (err) {
    const status = err.response?.status;
    if ((status === 429 || status === 500 || status === 502 || status === 503) && attempt < 5) {
      const delay = Math.min(30000, 500 * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
      console.warn(`[LeadsSync] Batch HTTP error ${status}; retrying in ${delay}ms (attempt ${attempt + 1}/5)`);
      await sleep(delay);
      return postGraphBatch(accessToken, batch, attempt + 1);
    }
    throw err;
  }
}

function buildLeadsRelativeUrl(formId, { fields, limit, after, since, until } = {}) {
  const params = new URLSearchParams();
  if (fields) params.set('fields', fields);
  if (limit) params.set('limit', String(limit));
  if (after) params.set('after', after);
  // Note: Meta API may not support since/until on /leads endpoint, but we'll try
  if (since) params.set('since', String(since));
  if (until) params.set('until', String(until));
  return `${formId}/leads?${params.toString()}`;
}

/**
 * Fetch leads from Meta API for a given page and date range
 */
async function fetchLeadsFromMeta(pageId, startDate, endDate) {
  // Use system token for forms list
  const systemToken = getSystemToken();
  
  // Use META_ACCESS_TOKEN for leads API calls
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN missing. Please configure it in Settings.");
  }
  console.log('[LeadsSync] Using META_ACCESS_TOKEN for leads API calls');
  
  // Convert date range to Unix timestamps for Meta API
  const startTimestamp = Math.floor(startDate.getTime() / 1000);
  const endTimestamp = Math.floor(endDate.getTime() / 1000);
  
  console.log(`[LeadsSync] Fetching leads for page ${pageId} from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  let allLeads = [];
  
  try {
    const maxPagesPerForm = 50;
    const leadsFields = "ad_id,campaign_id,created_time,campaign_name,ad_name,field_data";
    const leadsLimit = 2000;

    console.time('[LeadsSync] Fetch forms list');
    const formsUrl = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/leadgen_forms`;
    const formsFields = "id,locale,name,page_id,created_time";

    let allFormsData = [];
    let nextUrl = null;
    let formsPageCount = 0;

    do {
      let responseData;
      if (formsPageCount === 0) {
        const formsResponse = await axios.get(formsUrl, {
          headers: { Authorization: `Bearer ${systemToken}` },
          params: { fields: formsFields, limit: 100 },
          timeout: 60000,
        });
        responseData = formsResponse.data;
       
      } else {
        const nextResponse = await axios.get(nextUrl, {
          headers: { Authorization: `Bearer ${systemToken}` },
          timeout: 60000,
        });
        responseData = nextResponse.data;
      }

      const formsData = responseData.data || [];
      allFormsData = allFormsData.concat(formsData);
      formsPageCount++;

      if (responseData.paging && responseData.paging.next) {
        nextUrl = responseData.paging.next;
      } else {
        nextUrl = null;
      }
    } while (nextUrl && formsPageCount < 50);

    console.timeEnd('[LeadsSync] Fetch forms list');
    console.log(`[LeadsSync] Found ${allFormsData.length} total forms for page ${pageId}`);

    // Map formId -> form info (for output mapping)
    const formsById = new Map();
    for (const formData of allFormsData) {
      const form = {
        form_id: formData.id,
        name: formData.name || `Form ${formData.id}`,
        locale: formData.locale || 'en_US',
        page_id: formData.page_id || pageId,
        created_time: formData.created_time,
      };
      formsById.set(form.form_id, form);
    }

    const startMs = startDate.getTime();
    const endMs = endDate.getTime();

    // Track per-form pagination state
    const formState = new Map();
    for (const formId of formsById.keys()) {
      formState.set(formId, { after: null, done: false, pages: 0, retries: 0 });
    }

    const allFormIds = Array.from(formsById.keys());
    if (allFormIds.length === 0) return [];

    // Aggregate statistics for debugging
    const stats = {
      totalLeadsFromAPI: 0,
      filteredByDate: 0,
      filteredByMissingAdCampaign: 0,
      processedSuccessfully: 0,
      formsWithLeads: 0,
      formsWithoutLeads: 0,
      sampleFilteredLeads: [] // Keep a few samples for debugging
    };

    console.time('[LeadsSync] Fetch leads (batched)');

    let activeForms = allFormIds.filter(id => !formState.get(id).done);
    while (activeForms.length > 0) {
      // Build up to 50 subrequests
      const batchFormIds = activeForms.slice(0, 50);
      const batch = batchFormIds.map(formId => {
        const state = formState.get(formId);
        return {
          method: 'GET',
          relative_url: buildLeadsRelativeUrl(formId, {
            fields: leadsFields,
            limit: leadsLimit,
            after: state.after,
            // Try to filter by date range on server side (if supported by Meta API)
            // Only use since/until on first page to avoid filtering out paginated results
            since: state.pages === 0 ? startTimestamp : undefined,
            until: state.pages === 0 ? endTimestamp : undefined,
          }),
        };
      });

      const batchResponses = await postGraphBatch(accessToken, batch);
      
      // Log raw batch response structure for debugging (only for first batch)
      if (activeForms.length === allFormIds.length) {
        console.log(`[LeadsSync] ===== RAW BATCH API RESPONSE =====`);
        console.log(`[LeadsSync] Batch response type:`, Array.isArray(batchResponses) ? 'Array' : typeof batchResponses);
        console.log(`[LeadsSync] Batch response length:`, batchResponses?.length);
        if (batchResponses && batchResponses.length > 0) {
          console.log(`[LeadsSync] First batch item structure:`, JSON.stringify(batchResponses[0], null, 2));
        }
        console.log(`[LeadsSync] ===== END RAW BATCH RESPONSE =====`);
      }
      
      if (!Array.isArray(batchResponses) || batchResponses.length !== batchFormIds.length) {
        throw new Error(`[LeadsSync] Unexpected batch response shape (expected ${batchFormIds.length} items)`);
      }

      // Process in-order; each response corresponds to the request at the same index
      for (let i = 0; i < batchResponses.length; i++) {
        const formId = batchFormIds[i];
        const state = formState.get(formId);
        if (!state || state.done) continue;

        const item = batchResponses[i];
        const code = item?.code;
        let bodyJson = null;
        try {
          bodyJson = item?.body ? JSON.parse(item.body) : null;
        } catch (e) {
          bodyJson = null;
        }

        // Handle per-item errors
        const graphErr = bodyJson?.error;
        if (code !== 200 || graphErr) {
          const errCode = graphErr?.code;
          const errMsg = graphErr?.message || item?.body || `HTTP ${code}`;

          if (errCode === 190) {
            throw new Error(`[LeadsSync] Access token expired/invalid while fetching leads: ${errMsg}`);
          }

          if (isRetryableGraphErrorCode(errCode) && state.retries < 5) {
            state.retries += 1;
            const delay = Math.min(30000, 500 * Math.pow(2, state.retries - 1)) + Math.floor(Math.random() * 250);
            console.warn(`[LeadsSync] Throttled on form ${formId} (code ${errCode}); retry in ${delay}ms (attempt ${state.retries}/5)`);
            await sleep(delay);
            // Keep state.after as-is; we'll retry this page
            continue;
          }

          console.warn(`[LeadsSync] Skipping form ${formId} page due to error:`, errMsg);
          state.done = true;
          continue;
        }

        const leadsData = Array.isArray(bodyJson?.data) ? bodyJson.data : [];
        const paging = bodyJson?.paging;
        const nextAfter = paging?.cursors?.after || null;
        const hasNext = !!paging?.next && !!nextAfter;

        // Log raw API response for debugging (only first page to avoid spam)
        //if (state.pages === 0) {
        //  console.log(`[LeadsSync] ===== RAW API RESPONSE for Form ${formId} =====`);
        // console.log(`[LeadsSync] Full response body:`, JSON.stringify(bodyJson, null, 2));
         // if (leadsData.length > 0) {
         //   console.log(`[LeadsSync] Sample lead (first):`, JSON.stringify(leadsData[0], null, 2));
          //  console.log(`[LeadsSync] All available fields in first lead:`, Object.keys(leadsData[0]));
          //}
          //console.log(`[LeadsSync] ===== END RAW API RESPONSE =====`);
        //}

        // Update aggregate stats
        stats.totalLeadsFromAPI += leadsData.length;
        if (state.pages === 0 && leadsData.length > 0) {
          stats.formsWithLeads++;
        }

        // Debug: Log leads found per form (only first page to avoid spam)
        if (state.pages === 0 && leadsData.length > 0) {
          console.log(`[LeadsSync] Form ${formId}: Found ${leadsData.length} leads in first page`);
          
          // Check how many leads have ad_id/campaign_id vs missing them
          const leadsWithAttribution = leadsData.filter(l => l.ad_id && l.campaign_id).length;
          const leadsMissingAttribution = leadsData.length - leadsWithAttribution;
          
          if (leadsMissingAttribution > 0) {
            console.log(`[LeadsSync] Form ${formId}: ${leadsWithAttribution} leads have attribution, ${leadsMissingAttribution} missing ad_id/campaign_id`);
            
            // Log a sample lead missing attribution with full details for debugging
            const sampleMissing = leadsData.find(l => !l.ad_id || !l.campaign_id);
            if (sampleMissing) {
              console.log(`[LeadsSync] Form ${formId}: Sample lead MISSING attribution:`, {
                lead_id: sampleMissing.id,
                created_time: sampleMissing.created_time,
                has_ad_id: !!sampleMissing.ad_id,
                ad_id: sampleMissing.ad_id,
                has_campaign_id: !!sampleMissing.campaign_id,
                campaign_id: sampleMissing.campaign_id,
                available_fields: Object.keys(sampleMissing).join(', ')
              });
            }
          }
          
          if (leadsData.length > 0 && leadsData[0]?.created_time) {
            console.log(`[LeadsSync] Form ${formId}: Sample lead (first): created_time=${leadsData[0].created_time}, ad_id=${leadsData[0].ad_id || 'MISSING'}, campaign_id=${leadsData[0].campaign_id || 'MISSING'}`);
          }
        }

        // Decide whether we should stop paging further based on oldest lead time
        let stopBecauseOld = false;
        if (leadsData.length > 0) {
          let oldestMs = null;
          let newestMs = null;
          for (const lead of leadsData) {
            if (!lead?.created_time) continue;
            const t = new Date(lead.created_time).getTime();
            if (!Number.isFinite(t)) continue;
            if (oldestMs === null || t < oldestMs) oldestMs = t;
            if (newestMs === null || t > newestMs) newestMs = t;
          }
          if (oldestMs !== null && oldestMs < startMs) {
            stopBecauseOld = true;
          }
          // Log date range for debugging (only once per form)
          if (state.pages === 0 && oldestMs !== null && newestMs !== null) {
            console.log(`[LeadsSync] Form ${formId}: Leads date range ${new Date(oldestMs).toISOString()} to ${new Date(newestMs).toISOString()}, requested ${new Date(startMs).toISOString()} to ${new Date(endMs).toISOString()}`);
          }
        } else if (state.pages === 0) {
          // Log empty responses on first page
          stats.formsWithoutLeads++;
          console.log(`[LeadsSync] Form ${formId}: No leads found in first page`);
        }

        // Process leads from this response
        const form = formsById.get(formId) || { form_id: formId, page_id: pageId };
        let leadsProcessed = 0;
        let leadsFilteredOutDate = 0;
        let leadsFilteredOutMissing = 0;
        for (const lead of leadsData) {
          // Date range filter
          if (lead?.created_time) {
            const leadMs = new Date(lead.created_time).getTime();
            if (Number.isFinite(leadMs)) {
              const isBefore = leadMs < startMs;
              const isAfter = leadMs > endMs;
              if (isBefore || isAfter) {
                leadsFilteredOutDate++;
                stats.filteredByDate++;
                // Keep a sample of filtered leads for debugging (max 5)
                if (stats.sampleFilteredLeads.length < 5 && stats.sampleFilteredLeads.findIndex(s => s.reason === 'date' && s.formId === formId) === -1) {
                  stats.sampleFilteredLeads.push({
                    formId,
                    leadId: lead.id,
                    reason: 'date',
                    created_time: lead.created_time,
                    leadMs,
                    startMs,
                    endMs,
                    isBefore,
                    isAfter,
                    startDateStr: new Date(startMs).toISOString(),
                    endDateStr: new Date(endMs).toISOString(),
                    leadDateStr: new Date(leadMs).toISOString()
                  });
                }
                continue;
              }
            }
          }

          // Note: Meta Leads API does not provide ad_id and campaign_id per lead.
          // These fields are optional and will be null if not available.
          // Attribution data is available through Insights API (aggregate level only).
          // We save all leads even without attribution to capture all lead data.
          
          // Track leads without attribution for informational purposes
          if (!lead?.ad_id || !lead?.campaign_id) {
            stats.filteredByMissingAdCampaign++;
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
            if (
              key && typeof key === 'string' &&
              (key.toLowerCase().includes('name') || key.includes('பெயர்')) &&
              value && value.trim() !== ''
            ) {
              leadName = value;
              break;
            }
          }
          if (leadName === 'N/A') {
            leadName =
              fieldData.full_name ||
              `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() ||
              fieldData.name ||
              'N/A';
          }

          // Extract phone
          let phone = 'N/A';
          for (const [key, value] of Object.entries(fieldData)) {
            if (
              key && typeof key === 'string' &&
              (key.toLowerCase().includes('phone') || key.toLowerCase().includes('mobile')) &&
              value && value.trim() !== ''
            ) {
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
            if (
              key && typeof key === 'string' &&
              (key.toLowerCase().includes('street') || key.toLowerCase().includes('address')) &&
              value && value.trim() !== ''
            ) {
              street = value.toString();
              break;
            }
          }
          if (street === 'N/A') {
            street = fieldData.street_address || fieldData.address || fieldData.street || 'N/A';
          }
          const city = fieldData.city || 'N/A';

          const campaignId = lead.campaign_id ? String(lead.campaign_id) : null;
          const adId = lead.ad_id ? String(lead.ad_id) : null;
          const campaignName = lead.campaign_name || null;
          const adName = lead.ad_name || null;

          // Convert UTC time to IST for all time fields
          const istCreatedTime = convertUTCToIST(lead.created_time);
          const istDateChar = getISTDateString(lead.created_time);

          const mappedLead = {
            lead_id: lead.id,
            form_id: form.form_id,
            page_id: form.page_id || pageId,
            campaign_id: campaignId,
            ad_id: adId,
            created_time: istCreatedTime, // IST time
            name: leadName,
            phone: phone,
            email: fieldData.email || null,
            address: street,
            city: city,
            street: street,
            Campaign: campaignName,
            ad_name: adName,
            // Legacy fields for compatibility - all converted to IST
            Id: lead.id,
            Name: leadName,
            Phone: phone,
            Email: fieldData.email || 'N/A',
            Date: istDateChar, // IST date
            Time: istCreatedTime || '', // IST time
            TimeUtc: istCreatedTime || '', // IST time (keeping name for compatibility)
            DateChar: istDateChar, // IST date
            Street: street,
            City: city,
          };

          allLeads.push(mappedLead);
          leadsProcessed++;
          stats.processedSuccessfully++;
        }

        // Log processing stats for first page
        if (state.pages === 0 && leadsData.length > 0) {
          console.log(`[LeadsSync] Form ${formId}: Processed ${leadsProcessed} leads, filtered by date: ${leadsFilteredOutDate}, filtered by missing ad/campaign: ${leadsFilteredOutMissing} (total in batch: ${leadsData.length})`);
        }

        state.pages += 1;
        state.retries = 0; // reset on success

        if (state.pages >= maxPagesPerForm) {
          state.done = true;
          continue;
        }

        if (!hasNext || stopBecauseOld) {
          state.done = true;
          continue;
        }

        state.after = nextAfter;
      }

      activeForms = allFormIds.filter(id => !formState.get(id).done);
    }

    // Note: formsWithoutLeads is already tracked in the loop above

    console.timeEnd('[LeadsSync] Fetch leads (batched)');
    console.log(`[LeadsSync] ===== Batch Fetch Summary =====`);
    console.log(`[LeadsSync] Total forms checked: ${allFormIds.length}`);
    console.log(`[LeadsSync] Forms with leads: ${stats.formsWithLeads}, Forms without leads: ${stats.formsWithoutLeads}`);
    console.log(`[LeadsSync] Total leads from API: ${stats.totalLeadsFromAPI}`);
    console.log(`[LeadsSync] Filtered by date range: ${stats.filteredByDate}`);
    console.log(`[LeadsSync] Filtered by missing ad_id/campaign_id: ${stats.filteredByMissingAdCampaign}`);
    console.log(`[LeadsSync] Successfully processed: ${stats.processedSuccessfully}`);
    console.log(`[LeadsSync] Final leads array size: ${allLeads.length}`);
    
    // Log sample filtered leads if any
    if (stats.sampleFilteredLeads.length > 0) {
      console.log(`[LeadsSync] Sample filtered leads (showing why they were excluded):`);
      stats.sampleFilteredLeads.forEach((sample, idx) => {
        if (sample.reason === 'date') {
          console.log(`[LeadsSync]   ${idx + 1}. Form ${sample.formId}, Lead ${sample.leadId}:`);
          console.log(`[LeadsSync]      Lead date: ${sample.leadDateStr || sample.created_time}`);
          console.log(`[LeadsSync]      Requested range: ${sample.startDateStr} to ${sample.endDateStr}`);
          console.log(`[LeadsSync]      Filtered: ${sample.isBefore ? 'BEFORE' : 'AFTER'} requested range`);
        } else if (sample.reason === 'missing ad_id or campaign_id') {
          console.log(`[LeadsSync]   ${idx + 1}. Form ${sample.formId}, Lead ${sample.leadId}: ad_id=${sample.ad_id || 'MISSING'}, campaign_id=${sample.campaign_id || 'MISSING'}`);
        }
      });
    }
    
    return allLeads;
  } catch (error) {
    console.error('[LeadsSync] Error fetching leads from Meta API:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Sync leads job - fetches leads from Meta API and saves to database
 */
async function syncLeads() {
  const pageId = process.env.META_PAGE_ID;
  
  if (!pageId) {
    console.warn('[LeadsSync] META_PAGE_ID not configured, skipping sync');
    return;
  }

  try {
    console.log('[LeadsSync] Starting scheduled leads sync...');
    
    const endDate = new Date();

    // Incremental sync: fetch since last successful run, with a small overlap to avoid missing late-arriving leads
    const overlapMinutes = 10;
    const lastSyncValue = await getJobState(JOBSTATE_LAST_LEADS_SYNC_KEY);
    console.log(`[LeadsSync] Last sync timestamp from JobState: ${lastSyncValue || 'null (first run or cleared)'}`);
    let startDate;

    if (lastSyncValue) {
      const parsed = new Date(lastSyncValue);
      if (!isNaN(parsed.getTime())) {
        console.log(`[LeadsSync] Parsed last sync timestamp: ${parsed.toISOString()}, Current time: ${endDate.toISOString()}`);
        // Check if stored timestamp is in the future (likely invalid)
        if (parsed > endDate) {
          console.warn(`[LeadsSync] ⚠️  Stored last sync timestamp (${parsed.toISOString()}) is in the future. Resetting JobState.`);
          // Clear the invalid timestamp
          await setJobState(JOBSTATE_LAST_LEADS_SYNC_KEY, '');
          startDate = null; // Will trigger fallback below
        } else {
          startDate = parsed;
          startDate = new Date(startDate.getTime() - overlapMinutes * 60 * 1000);
          console.log(`[LeadsSync] Using incremental sync: from ${startDate.toISOString()} (last sync: ${parsed.toISOString()} - ${overlapMinutes} min overlap)`);
        }
      } else {
        console.warn(`[LeadsSync] ⚠️  Invalid last sync timestamp format: ${lastSyncValue}`);
      }
    }

    // First run fallback: last 24 hours
    if (!startDate) {
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      console.log(`[LeadsSync] First run or no valid last sync - using 24 hour window`);
    }
    
    // Validate date range (warn if dates seem incorrect)
    const now = new Date();
    if (startDate > now || endDate > now) {
      console.warn(`[LeadsSync] ⚠️  Date range includes future dates: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}, now=${now.toISOString()}`);
      console.warn(`[LeadsSync] This may cause no leads to be fetched. Check system time and JobState.`);
    }
    if (startDate >= endDate) {
      console.warn(`[LeadsSync] ⚠️  Invalid date range: startDate (${startDate.toISOString()}) >= endDate (${endDate.toISOString()})`);
    }
    
    // Log the date range being used for debugging
    const hoursInRange = (endDate - startDate) / (1000 * 60 * 60);
    const daysInRange = hoursInRange / 24;
    console.log(`[LeadsSync] Using date range: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`);
    console.log(`[LeadsSync] Date range spans ${hoursInRange.toFixed(2)} hours (${daysInRange.toFixed(2)} days)`);
    
    // Detect and fix invalid date ranges
    const shouldResetJobState = startDate > now || (daysInRange < 0.5 && lastSyncValue); // Less than 12 hours and has JobState
    
    if (shouldResetJobState) {
      console.warn(`[LeadsSync] ⚠️  Detected problematic date range - likely due to invalid JobState timestamp.`);
      console.warn(`[LeadsSync] Resetting JobState and using 24-hour window instead.`);
      await setJobState(JOBSTATE_LAST_LEADS_SYNC_KEY, '');
      startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
      console.log(`[LeadsSync] Reset to 24-hour window: startDate=${startDate.toISOString()}, endDate=${endDate.toISOString()}`);
    }
    
    // Fetch leads from Meta API
    console.time('[LeadsSync] Total Meta fetch');
    const leads = await fetchLeadsFromMeta(pageId, startDate, endDate);
    console.timeEnd('[LeadsSync] Total Meta fetch');
    
    console.log(`[LeadsSync] Fetched ${leads.length} leads from Meta API`);
    //console.log('[LeadsSync] Leads:', leads);
    if (leads.length === 0) {
      console.log('[LeadsSync] No leads to save');
      
      // Recalculate days after potential reset
      const finalHoursInRange = (endDate - startDate) / (1000 * 60 * 60);
      const finalDaysInRange = finalHoursInRange / 24;
      
      // If date range is reasonable (less than 7 days) and not in the future, advance cursor
      if (finalDaysInRange <= 7 && startDate <= now) {
        console.log(`[LeadsSync] Date range is reasonable (${finalDaysInRange.toFixed(2)} days), advancing JobState cursor`);
        await setJobState(JOBSTATE_LAST_LEADS_SYNC_KEY, endDate.toISOString());
      } else {
        console.warn(`[LeadsSync] ⚠️  Date range issue detected (${finalDaysInRange.toFixed(2)} days, startDate ${startDate > now ? 'in future' : 'valid'}). Not advancing JobState cursor to prevent getting stuck.`);
        console.warn(`[LeadsSync] JobState will be reset on next run if issue persists.`);
      }
      return;
    }
    
    // Save to database
    console.time('[LeadsSync] Save leads to DB');
    const result = await saveLeads(leads);
    console.timeEnd('[LeadsSync] Save leads to DB');
    console.log(`[LeadsSync] Sync completed: ${result.inserted} inserted, ${result.updated} updated`);

    // Persist last successful sync timestamp only after DB save succeeds
    await setJobState(JOBSTATE_LAST_LEADS_SYNC_KEY, endDate.toISOString());
  } catch (error) {
    console.error('[LeadsSync] Error in scheduled sync:', error);
    // Don't throw - allow scheduler to continue
  }
}

/**
 * Initialize the scheduled job
 * Runs every 15 minutes (900,000 ms)
 */
function startLeadsSyncScheduler() {
  const pageId = process.env.META_PAGE_ID;
  
  if (!pageId) {
    console.warn('[LeadsSync] ⚠️  META_PAGE_ID not configured in .env file');
    console.warn('[LeadsSync] To enable scheduled leads sync, add to server/.env:');
    console.warn('[LeadsSync]    META_PAGE_ID=your_page_id_here');
    console.warn('[LeadsSync] Example: META_PAGE_ID=113830624877941');
    console.warn('[LeadsSync] Scheduler will not start until META_PAGE_ID is configured.');
    return null;
  }

  console.log('[LeadsSync] Starting leads sync scheduler (every 15 minutes)');
  
  // Run immediately on startup
  syncLeads().catch(err => {
    console.error('[LeadsSync] Error in initial sync:', err);
  });
  
  // Then run every 15 minutes
  const intervalId = setInterval(() => {
    syncLeads().catch(err => {
      console.error('[LeadsSync] Error in scheduled sync:', err);
    });
  }, 15 * 60 * 1000); // 15 minutes in milliseconds
  
  return intervalId;
}

module.exports = {
  syncLeads,
  startLeadsSyncScheduler,
  fetchLeadsFromMeta,
  getPageAccessToken
};

