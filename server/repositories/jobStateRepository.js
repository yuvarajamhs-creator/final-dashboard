// server/repositories/jobStateRepository.js
const { sql, getPool } = require('../db');

async function getJobState(jobKey) {
  const pool = await getPool();
  const r = await pool.request()
    .input('k', sql.NVarChar(200), jobKey)
    .query('SELECT JobValue FROM JobState WHERE JobKey = @k');
  return r.recordset[0]?.JobValue ?? null;
}

async function setJobState(jobKey, jobValue) {
  const pool = await getPool();
  await pool.request()
    .input('k', sql.NVarChar(200), jobKey)
    .input('v', sql.NVarChar(sql.MAX), jobValue)
    .query(`
      MERGE JobState AS target
      USING (SELECT @k AS JobKey, @v AS JobValue) AS source
      ON target.JobKey = source.JobKey
      WHEN MATCHED THEN
        UPDATE SET JobValue = source.JobValue, UpdatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (JobKey, JobValue, UpdatedAt)
        VALUES (source.JobKey, source.JobValue, SYSUTCDATETIME());
    `);
}

module.exports = {
  getJobState,
  setJobState,
};


