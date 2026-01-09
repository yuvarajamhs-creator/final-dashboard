// server/repositories/leadsRepository.js
const { sql, getPool } = require('../db');

/**
 * Save or update leads in bulk
 * Uses MERGE (upsert) to handle duplicates based on lead_id
 */
async function saveLeads(leads) {
  if (!leads || leads.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const pool = await getPool();
  const transaction = new sql.Transaction(pool);
  
  try {
    await transaction.begin();
    
    let inserted = 0;
    let updated = 0;
    
    // Process leads in batches of 100 for better performance
    const batchSize = 100;
    for (let i = 0; i < leads.length; i += batchSize) {
      const batch = leads.slice(i, i + batchSize);
      
      for (const lead of batch) {
        try {
          // Extract lead data
          const leadId = lead.lead_id || lead.Id || lead.id || null;
          const formId = lead.form_id || null;
          const pageId = lead.page_id || null;
          const campaignId = lead.campaign_id || null;
          const adId = lead.ad_id || null;
          const name = lead.Name || lead.name || 'N/A';
          const phone = lead.Phone || lead.phone || 'N/A';
          const createdTime = lead.created_time || lead.TimeUtc || lead.Time || null;
          const dateChar = lead.DateChar || lead.Date || (createdTime ? new Date(createdTime).toISOString().split('T')[0] : null);
          const campaign = lead.Campaign || lead.campaign_name || null;
          const adName = lead.ad_name || null;
          const street = lead.Street || lead.street || lead.address || 'N/A';
          const city = lead.City || lead.city || 'N/A';
          
          // Convert created_time to DATETIME2 format
          let createdTimeValue = null;
          if (createdTime) {
            try {
              const date = new Date(createdTime);
              if (!isNaN(date.getTime())) {
                createdTimeValue = date.toISOString();
              }
            } catch (e) {
              console.warn(`[LeadsRepository] Invalid date format for lead ${leadId}:`, createdTime);
            }
          }
          
          // Note: Meta Leads API does not provide ad_id and campaign_id per lead.
          // These fields are optional and will be saved as null if not available.
          // Attribution data is available through Insights API (aggregate level only).
          
          // Check if lead already exists
          const checkRequest = new sql.Request(transaction);
          checkRequest.input('lead_id', sql.NVarChar, leadId);
          const existing = await checkRequest.query(
            'SELECT Id FROM Leads WHERE lead_id = @lead_id'
          );
          
          if (existing.recordset.length > 0) {
            // Update existing lead
            const updateRequest = new sql.Request(transaction);
            updateRequest.input('lead_id', sql.NVarChar, leadId);
            updateRequest.input('name', sql.NVarChar, name);
            updateRequest.input('phone', sql.NVarChar, phone);
            updateRequest.input('ad_id', sql.NVarChar, adId);
            updateRequest.input('campaign_id', sql.NVarChar, campaignId);
            updateRequest.input('form_id', sql.NVarChar, formId);
            updateRequest.input('page_id', sql.NVarChar, pageId);
            updateRequest.input('created_time', sql.DateTime2, createdTimeValue);
            updateRequest.input('dateChar', sql.Char(10), dateChar);
            updateRequest.input('campaign', sql.NVarChar, campaign);
            updateRequest.input('ad_name', sql.NVarChar, adName);
            
            await updateRequest.query(`
              UPDATE Leads 
              SET Name = @name,
                  Phone = @phone,
                  ad_id = @ad_id,
                  campaign_id = @campaign_id,
                  form_id = @form_id,
                  page_id = @page_id,
                  created_time = @created_time,
                  DateChar = @dateChar,
                  Campaign = @campaign,
                  ad_name = @ad_name,
                  TimeUtc = @created_time
              WHERE lead_id = @lead_id
            `);
            updated++;
          } else {
            // Insert new lead
            const insertRequest = new sql.Request(transaction);
            insertRequest.input('lead_id', sql.NVarChar, leadId);
            insertRequest.input('name', sql.NVarChar, name);
            insertRequest.input('phone', sql.NVarChar, phone);
            insertRequest.input('ad_id', sql.NVarChar, adId);
            insertRequest.input('campaign_id', sql.NVarChar, campaignId);
            insertRequest.input('form_id', sql.NVarChar, formId);
            insertRequest.input('page_id', sql.NVarChar, pageId);
            insertRequest.input('created_time', sql.DateTime2, createdTimeValue);
            insertRequest.input('dateChar', sql.Char(10), dateChar);
            insertRequest.input('campaign', sql.NVarChar, campaign);
            insertRequest.input('ad_name', sql.NVarChar, adName);
            
            await insertRequest.query(`
              INSERT INTO Leads (lead_id, Name, Phone, ad_id, campaign_id, form_id, page_id, created_time, DateChar, Campaign, ad_name, TimeUtc)
              VALUES (@lead_id, @name, @phone, @ad_id, @campaign_id, @form_id, @page_id, @created_time, @dateChar, @campaign, @ad_name, @created_time)
            `);
            inserted++;
          }
        } catch (leadError) {
          console.error(`[LeadsRepository] Error processing lead ${lead.lead_id || lead.Id}:`, leadError.message);
          // Continue with next lead
        }
      }
    }
    
    await transaction.commit();
    console.log(`[LeadsRepository] Saved ${inserted} new leads, updated ${updated} existing leads`);
    return { inserted, updated };
  } catch (error) {
    await transaction.rollback();
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

async function getLeadsByCampaignAndAd(campaignIds, adIds, dateFrom, dateTo) {
  const pool = await getPool();
  const request = pool.request();
  
  const campaignIdList = normalizeIds(campaignIds);
  const adIdList = normalizeIds(adIds);

  let query = `
    SELECT 
      Id,
      Name,
      Phone,
      TimeUtc,
      DateChar,
      Campaign,
      ad_id,
      campaign_id,
      lead_id,
      form_id,
      page_id,
      created_time,
      ad_name
    FROM Leads
    WHERE 1=1
  `;
  
  // Add filters
  if (campaignIdList.length > 0) {
    const paramNames = campaignIdList.map((id, idx) => {
      const paramName = `campaign_id_${idx}`;
      request.input(paramName, sql.NVarChar, id);
      return `@${paramName}`;
    });
    query += ` AND campaign_id IN (${paramNames.join(',')})`;
  }
  
  if (adIdList.length > 0) {
    const paramNames = adIdList.map((id, idx) => {
      const paramName = `ad_id_${idx}`;
      request.input(paramName, sql.NVarChar, id);
      return `@${paramName}`;
    });
    query += ` AND ad_id IN (${paramNames.join(',')})`;
  }
  
  if (dateFrom) {
    request.input('dateFrom', sql.DateTime2, new Date(dateFrom + 'T00:00:00').toISOString());
    query += ' AND created_time >= @dateFrom';
  }
  
  if (dateTo) {
    request.input('dateTo', sql.DateTime2, new Date(dateTo + 'T23:59:59').toISOString());
    query += ' AND created_time <= @dateTo';
  }
  
  query += ' ORDER BY created_time DESC';
  
  try {
    const result = await request.query(query);
    return result.recordset.map(row => ({
      Id: row.Id,
      Name: row.Name,
      Phone: row.Phone,
      Time: row.TimeUtc,
      TimeUtc: row.TimeUtc,
      Date: row.DateChar,
      DateChar: row.DateChar,
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
      name: row.Name,
      phone: row.Phone,
      date: row.DateChar,
      time: row.TimeUtc
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

