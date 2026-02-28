// server/routes/uniqueLeads.js
const express = require('express');
const { authMiddleware } = require('../auth');
const { importLeads, getByCategory } = require('../repositories/uniqueLeadsRepository');

const router = express.Router();

const MAX_ROWS = 50000;
function validateRows(rows) {
  if (!Array.isArray(rows)) return { valid: false, error: 'rows must be an array' };
  if (rows.length === 0) return { valid: false, error: 'File is empty' };
  if (rows.length > MAX_ROWS) return { valid: false, error: `Maximum ${MAX_ROWS} rows allowed` };
  const first = rows[0] || {};
  const phone = first.phoneNumber ?? first.phone;
  if (phone === undefined && first.phoneNumber === undefined && first.phone === undefined) {
    return { valid: false, error: 'Expected columns include: Date with Time, Batch Code, Name, Phone Number, Sugar Poll, Email.' };
  }
  return { valid: true };
}

/**
 * POST /api/unique-leads/import
 * Body: { sourceType: 'paid' | 'youtube' | 'free', rows: Array<Lead> }
 */
router.post('/import', authMiddleware, async (req, res) => {
  try {
    const { sourceType, rows } = req.body || {};
    if (!sourceType || !rows) {
      return res.status(400).json({ error: 'sourceType and rows are required' });
    }
    const validation = validateRows(rows);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    const result = await importLeads(sourceType, rows);
    return res.json(result);
  } catch (err) {
    console.error('[uniqueLeads] import error:', err);
    return res.status(500).json({ error: err.message || 'Import failed' });
  }
});

/**
 * GET /api/unique-leads/export?category=paid|youtube|free
 * Returns JSON array of leads for the category (client can build CSV/Excel)
 */
router.get('/export', authMiddleware, async (req, res) => {
  try {
    const category = (req.query.category || '').toLowerCase();
    if (!['paid', 'youtube', 'free'].includes(category)) {
      return res.status(400).json({ error: 'category must be paid, youtube, or free' });
    }
    const data = await getByCategory(category);
    return res.json(data);
  } catch (err) {
    console.error('[uniqueLeads] export error:', err);
    return res.status(500).json({ error: err.message || 'Export failed' });
  }
});

module.exports = router;
