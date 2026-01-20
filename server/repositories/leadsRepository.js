// server/repositories/leadsRepository.js
const { supabase } = require('../supabase');

/**
 * Check if timestamp contains timezone offset (e.g., +05:30)
 * Meta API returns timestamps with timezone offset, and we should preserve them as-is
 * @param {string} timestamp - Timestamp string to check
 * @returns {boolean} - True if timestamp contains timezone offset
 */
function hasTimezoneOffset(timestamp) {
  if (!timestamp || typeof timestamp !== 'string') return false;
  return timestamp.includes('+05:30') || 
         timestamp.includes('+0530') || 
         timestamp.includes('+05:30:00') ||
         timestamp.includes('-05:30') ||
         timestamp.match(/[+-]\d{2}:?\d{2}/); // Generic timezone pattern
}

/**
 * Save or update leads in bulk
 * Uses Supabase upsert to handle duplicates based on lead_id
 */
async function saveLeads(leads) {
  if (!leads || leads.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    let inserted = 0;
    let updated = 0;
    
    // Process leads in batches of 100 for better performance
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      // Transform batch to match Supabase schema
      // Schema uses lowercase table name 'leads' with lowercase column names (PostgreSQL convention)
      const transformedBatch = batch.map(lead => {
        const leadId = lead.lead_id || lead.Id || lead.id || null;
        const formId = lead.form_id || null;
        const pageId = lead.page_id || null;
        const campaignId = lead.campaign_id || null;
        const adId = lead.ad_id || null;
        const name = lead.Name || lead.name || 'N/A';
        const phone = lead.Phone || lead.phone || 'N/A';
        const createdTime = lead.created_time || lead.TimeUtc || lead.Time || null;
        const campaign = lead.Campaign || lead.campaign_name || null;
        const adName = lead.ad_name || null;
        
        // Validate: Skip conversion if timestamp already has timezone offset (+05:30)
        const hasOffset = hasTimezoneOffset(createdTime);
        
        // Extract DateChar without timezone conversion if timezone offset is present
        let dateChar = lead.DateChar || lead.Date || null;
        if (!dateChar && createdTime) {
          if (hasOffset) {
            // Extract date directly from string (preserves timezone)
            dateChar = createdTime.split('T')[0];
          } else {
            // Fallback for timestamps without timezone
            dateChar = new Date(createdTime).toISOString().split('T')[0];
          }
        }
        
        // Store timestamp exactly as received if it has timezone offset, otherwise convert to ISO
        let createdTimeValue = null;
        if (createdTime) {
          try {
            if (hasOffset) {
              // Store exactly as received (with timezone offset)
              createdTimeValue = createdTime;
            } else {
              // Convert to ISO for timestamps without timezone
              const date = new Date(createdTime);
              if (!isNaN(date.getTime())) {
                createdTimeValue = date.toISOString();
              }
            }
          } catch (e) {
            console.warn(`[LeadsRepository] Invalid date format for lead ${leadId}:`, createdTime);
          }
        }
        
        // Map to mixed case column names matching actual table schema (public.Leads)
        return {
          Name: name,
          Phone: phone,
          TimeUtc: createdTimeValue,
          DateChar: dateChar,
          Campaign: campaign,
          ad_id: adId,
          campaign_id: campaignId,
          lead_id: leadId,
          form_id: formId,
          page_id: pageId,
          created_time: createdTimeValue,
          ad_name: adName
        };
      });

      // Use upsert to insert or update based on lead_id conflict
      // Supabase will update existing rows and insert new ones
      // Table name: 'Leads' (capitalized) - matches public.Leads in database
      // Requires unique constraint on lead_id - run fix-leads-unique-constraint.sql if missing
      const { data, error } = await supabase
        .from('Leads')
        .upsert(transformedBatch, {
          onConflict: 'lead_id',
          ignoreDuplicates: false
        })
        .select('Id, lead_id, Name, Phone, TimeUtc, DateChar, Campaign');

      if (error) {
        console.error('[LeadsRepository] Error upserting leads batch:', error);
        throw error;
      }

      // Count inserted vs updated by checking if rows already existed
      // Since upsert doesn't tell us which were inserted vs updated,
      // we'll estimate based on the response
      // All rows in batch were processed
      for (const lead of batch) {
        // Check if lead_id existed before (we can't tell for sure, so we'll assume new)
        // In practice, you might want to query first to determine this
        const existing = transformedBatch.find(l => l.lead_id === (lead.lead_id || lead.Id || lead.id));
        if (existing) {
          // Assume it was updated (could be improved with a before/after query)
          updated++;
        } else {
          inserted++;
        }
      }
      
      // Simple approach: count all as inserted, Supabase handles updates automatically
      inserted += transformedBatch.length;
    }
    
    console.log(`[LeadsRepository] Saved ${inserted} leads (upserted - includes updates)`);
    return { inserted, updated: 0 }; // Supabase upsert doesn't differentiate
  } catch (error) {
    console.error('[LeadsRepository] Error saving leads:', error);
    throw error;
  }
}

/**
 * Get leads filtered by campaign and/or ad
 */
// Normalize single value or comma-separated string or array into array of strings
function normalizeIds(ids) {
  if (!ids) return [];
  if (Array.isArray(ids)) return ids.filter(Boolean).map(id => String(id));
  if (typeof ids === 'string') {
    return ids
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => String(id));
  }
  return [String(ids)];
}

async function getLeadsByCampaignAndAd(campaignIds, adIds, dateFrom, dateTo, formIds = null, pageIds = null) {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  try {
    // Table name: 'Leads' (capitalized) - matches public.Leads in database
    let query = supabase
      .from('Leads')
      .select('Id, Name, Phone, TimeUtc, DateChar, Campaign, ad_id, campaign_id, lead_id, form_id, page_id, created_time, ad_name');

    const campaignIdList = normalizeIds(campaignIds);
    const adIdList = normalizeIds(adIds);
    const formIdList = normalizeIds(formIds);
    const pageIdList = normalizeIds(pageIds);

    // Add filters
    if (campaignIdList.length > 0) {
      query = query.in('campaign_id', campaignIdList);
    }

    if (adIdList.length > 0) {
      query = query.in('ad_id', adIdList);
    }

    if (formIdList.length > 0) {
      query = query.in('form_id', formIdList);
    }

    if (pageIdList.length > 0) {
      query = query.in('page_id', pageIdList);
    }

    if (dateFrom) {
      const dateFromISO = new Date(dateFrom + 'T00:00:00').toISOString();
      query = query.gte('created_time', dateFromISO);
    }

    if (dateTo) {
      const dateToISO = new Date(dateTo + 'T23:59:59').toISOString();
      query = query.lte('created_time', dateToISO);
    }

    // Order by created_time descending
    query = query.order('created_time', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('[LeadsRepository] Error fetching leads:', error);
      throw error;
    }

    // Transform to match expected format (with both camelCase and snake_case for compatibility)
    // Supabase returns mixed case column names: Id, Name, Phone, TimeUtc, DateChar, Campaign
    return (data || []).map(row => ({
      Id: row.Id,
      id: row.Id,
      Name: row.Name,
      name: row.Name,
      Phone: row.Phone,
      phone: row.Phone,
      Time: row.TimeUtc,
      TimeUtc: row.TimeUtc,
      time_utc: row.TimeUtc,
      Date: row.DateChar,
      DateChar: row.DateChar,
      date_char: row.DateChar,
      Campaign: row.Campaign,
      campaign: row.Campaign,
      ad_id: row.ad_id,
      campaign_id: row.campaign_id,
      lead_id: row.lead_id,
      form_id: row.form_id,
      page_id: row.page_id,
      created_time: row.created_time,
      ad_name: row.ad_name,
      // Legacy compatibility fields
      time: row.TimeUtc,
      date: row.DateChar
    }));
  } catch (error) {
    console.error('[LeadsRepository] Error fetching leads:', error);
    throw error;
  }
}

/**
 * Get all leads in a date range
 */
async function getLeadsByDateRange(dateFrom, dateTo) {
  return getLeadsByCampaignAndAd(null, null, dateFrom, dateTo);
}

/**
 * Upsert a single lead
 */
async function upsertLead(lead) {
  return saveLeads([lead]);
}

module.exports = {
  saveLeads,
  getLeadsByCampaignAndAd,
  getLeadsByDateRange,
  upsertLead
};
