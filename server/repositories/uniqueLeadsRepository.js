// server/repositories/uniqueLeadsRepository.js
const { supabase } = require('../supabase');

const TABLES = {
  paid: 'unique_leads_paid',
  youtube: 'unique_leads_youtube',
  free: 'unique_leads_free'
};

const SOURCE_LABELS = { paid: 'Paid', youtube: 'YouTube', free: 'Free' };

/**
 * Get set of phone numbers from a category table (normalized for matching)
 */
function normalizePhone(phone) {
  if (phone == null || phone === '') return '';
  return String(phone).trim().replace(/\s/g, '');
}

async function getPhonesFromTable(tableName) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.from(tableName).select('phone');
  if (error) throw error;
  const set = new Set();
  (data || []).forEach((row) => {
    const p = normalizePhone(row.phone);
    if (p) set.add(p);
  });
  return set;
}
async function getPaidPhones() {
  return getPhonesFromTable(TABLES.paid);
}
async function getYouTubePhones() {
  return getPhonesFromTable(TABLES.youtube);
}

/**
 * Build row for DB from normalized lead object
 */
function toRow(lead, sourceType) {
  return {
    date_time: lead.dateTime ?? lead.date_time ?? '',
    batch_code: lead.batchCode ?? lead.batch_code ?? '',
    name: lead.name ?? '',
    phone: normalizePhone(lead.phoneNumber ?? lead.phone ?? lead.phoneNumber ?? '') || '',
    sugar_poll: lead.sugarPoll ?? lead.sugar_poll ?? '',
    email: lead.email ?? '',
    lead_source_type: sourceType
  };
}

/**
 * Paid import: insert all. Remove any matching phones from YouTube and Free (Paid overrides).
 * Deduplicate by phone so one upsert batch never has the same phone twice (avoids PostgreSQL "cannot affect row a second time").
 */
async function importPaid(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const normalized = rows.map((r) => toRow(r, SOURCE_LABELS.paid)).filter((r) => r.phone);
  const seen = new Set();
  const toInsert = [];
  for (const row of normalized) {
    if (seen.has(row.phone)) continue;
    seen.add(row.phone);
    toInsert.push(row);
  }
  if (toInsert.length === 0) return { imported: 0, conflicts: [] };

  const phones = toInsert.map((r) => r.phone);
  await supabase.from(TABLES.youtube).delete().in('phone', phones);
  await supabase.from(TABLES.free).delete().in('phone', phones);

  const batchSize = 500;
  let imported = 0;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    const { error } = await supabase.from(TABLES.paid).upsert(batch, { onConflict: 'phone' });
    if (error) throw error;
    imported += batch.length;
  }
  return { imported, conflicts: [] };
}

/**
 * YouTube import: exclude phones already in Paid. Those go to conflicts.
 */
async function importYouTube(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const paidPhones = await getPaidPhones();
  const normalized = rows.map((r) => ({ ...toRow(r, SOURCE_LABELS.youtube), _raw: r }));
  const toInsert = [];
  const conflicts = [];
  const seen = new Set();
  for (const row of normalized) {
    if (!row.phone) continue;
    if (paidPhones.has(row.phone)) {
      conflicts.push({
        phone: row.phone,
        name: row.name,
        sourceConflict: 'YouTube',
        existingTableName: 'Paid Leads'
      });
      continue;
    }
    if (seen.has(row.phone)) continue;
    seen.add(row.phone);
    toInsert.push(row);
  }

  if (toInsert.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize).map(({ _raw, ...r }) => r);
      const { error } = await supabase.from(TABLES.youtube).upsert(batch, { onConflict: 'phone' });
      if (error) throw error;
    }
  }
  return { imported: toInsert.length, conflicts };
}

/**
 * Free import: exclude phones in Paid or YouTube. Those go to conflicts.
 */
async function importFree(rows) {
  if (!supabase) throw new Error('Supabase not configured');
  const [paidPhones, youtubePhones] = await Promise.all([getPaidPhones(), getYouTubePhones()]);
  const normalized = rows.map((r) => ({ ...toRow(r, SOURCE_LABELS.free), _raw: r }));
  const toInsert = [];
  const conflicts = [];
  const seen = new Set();
  for (const row of normalized) {
    if (!row.phone) continue;
    if (paidPhones.has(row.phone)) {
      conflicts.push({
        phone: row.phone,
        name: row.name,
        sourceConflict: 'Free',
        existingTableName: 'Paid Leads'
      });
      continue;
    }
    if (youtubePhones.has(row.phone)) {
      conflicts.push({
        phone: row.phone,
        name: row.name,
        sourceConflict: 'Free',
        existingTableName: 'YouTube Leads'
      });
      continue;
    }
    if (seen.has(row.phone)) continue;
    seen.add(row.phone);
    toInsert.push(row);
  }

  if (toInsert.length > 0) {
    const batchSize = 500;
    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize).map(({ _raw, ...r }) => r);
      const { error } = await supabase.from(TABLES.free).upsert(batch, { onConflict: 'phone' });
      if (error) throw error;
    }
  }
  return { imported: toInsert.length, conflicts };
}

/**
 * Import by source type. Returns { imported, conflicts, previewRows }.
 */
async function importLeads(sourceType, rows) {
  const allowed = ['paid', 'youtube', 'free'];
  const src = sourceType && allowed.includes(String(sourceType).toLowerCase())
    ? String(sourceType).toLowerCase()
    : null;
  if (!src) throw new Error('Invalid source type. Use: paid, youtube, or free');

  let result;
  if (src === 'paid') result = await importPaid(rows);
  else if (src === 'youtube') result = await importYouTube(rows);
  else result = await importFree(rows);

  const previewRows = rows.slice(0, 500).map((r) => ({
    dateTime: r.dateTime ?? r.date_time,
    batchCode: r.batchCode ?? r.batch_code,
    name: r.name,
    phoneNumber: r.phoneNumber ?? r.phone,
    sugarPoll: r.sugarPoll ?? r.sugar_poll,
    email: r.email,
    leadSourceType: SOURCE_LABELS[src]
  }));
  return { ...result, previewRows };
}

/**
 * Get all leads for a category (for export)
 */
async function getByCategory(category) {
  if (!supabase) throw new Error('Supabase not configured');
  const table = TABLES[category];
  if (!table) throw new Error('Invalid category. Use: paid, youtube, or free');
  const { data, error } = await supabase.from(table).select('*').order('id', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => ({
    dateTime: row.date_time,
    batchCode: row.batch_code,
    name: row.name,
    phoneNumber: row.phone,
    sugarPoll: row.sugar_poll,
    email: row.email,
    leadSourceType: row.lead_source_type
  }));
}

module.exports = {
  importLeads,
  getByCategory,
  TABLES,
  SOURCE_LABELS
};
