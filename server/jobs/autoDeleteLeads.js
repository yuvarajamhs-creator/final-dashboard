// server/jobs/autoDeleteLeads.js
// Runs once daily and deletes unique_leads records older than 30 days.

const { deleteLeadsOlderThan30Days } = require('../repositories/uniqueLeadsRepository');

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

async function runAutoDelete() {
  try {
    const result = await deleteLeadsOlderThan30Days();
    if (result.deleted > 0) {
      console.log(`[AutoDeleteLeads] Deleted ${result.deleted} lead(s) older than 30 days (cutoff: ${result.cutoff})`);
    }
  } catch (err) {
    console.error('[AutoDeleteLeads] Error during auto-delete:', err.message);
  }
}

function startAutoDeleteScheduler() {
  // Run once at startup to clean up any already-expired records
  runAutoDelete();

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    runAutoDelete();
  }, INTERVAL_MS);

  console.log('[AutoDeleteLeads] Scheduler started — runs every 24 hours');
  return intervalId;
}

module.exports = { startAutoDeleteScheduler, runAutoDelete };
