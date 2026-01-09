// server/db.js
const path = require('path');
// load env from server/.env explicitly
require('dotenv').config({ path: path.join(__dirname, '.env') });

const sql = require('mssql');

let poolPromise = null;

const parsePort = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

const buildConfig = () => {
  const server = (process.env.DB_SERVER || '').trim();
  if (!server) {
    throw new Error('DB_SERVER is not defined in .env');
  }

  const port = parsePort(process.env.DB_PORT);

  // Check if server contains instance name (e.g., "SERVER\\INSTANCE" or "SERVER/INSTANCE")
  const hasInstanceName = server.includes('\\') || server.includes('/');
  
  // If using named instance, don't specify port (SQL Server Browser will handle it)
  // If using IP:port, specify the port explicitly
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: server,
    database: process.env.DB_NAME,
    options: {
      encrypt: String(process.env.DB_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate: String(process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    connectionTimeout: 60000, // Increased to 60 seconds to handle network latency issues
    requestTimeout: 60000,
  };

  // Only add port if not using named instance and port is specified
  if (!hasInstanceName && port !== undefined) {
    config.port = port;
  }

  // sanity
  if (!config.server || typeof config.server !== 'string') {
    throw new Error('The "config.server" property is required and must be a string.');
  }

  return config;
};

async function getPool() {
  if (poolPromise) return poolPromise;

  const config = buildConfig();

  // redacted debug info
  const hasInstanceName = config.server.includes('\\') || config.server.includes('/');
  console.log('MSSQL config (redacted):', {
    server: config.server,
    database: config.database,
    port: config.port || (hasInstanceName ? 'dynamic (via SQL Browser)' : 'default 1433'),
    connectionType: hasInstanceName ? 'Named Instance' : 'IP:Port',
    encrypt: config.options.encrypt,
    trustServerCertificate: config.options.trustServerCertificate,
  });

  poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
      pool.on('error', err => {
        console.error('MSSQL pool error event:', err && err.message);
        poolPromise = null; // reset pool on error to allow reconnection
      });
      console.log('MSSQL connection pool created successfully.');
      return pool;
    })
    .catch(err => {
      console.error('\n=== SQL Pool Connection Error ===');
      console.error('Error Message:', err && err.message);
      console.error('Error Code:', err && err.code);
      
      // Provide helpful troubleshooting information
      if (err && err.code === 'ESOCKET') {
        const hasInstanceName = config.server.includes('\\') || config.server.includes('/');
        const serverName = config.server.split(/[\\/]/)[0];
        
        console.error('\n=== Troubleshooting ESOCKET Error ===');
        console.error('Connection Type:', hasInstanceName ? 'Named Instance' : 'IP:Port');
        console.error('Target Server:', serverName);
        if (hasInstanceName) {
          console.error('Instance Name:', config.server.split(/[\\/]/)[1]);
          console.error('\nSteps to fix:');
          console.error('1. Verify SQL Server is running on', serverName);
          console.error('2. Ensure SQL Server Browser service is RUNNING (required for named instances)');
          console.error('3. Check if firewall allows UDP port 1434 (SQL Browser) and TCP connections');
          console.error('4. Test connectivity: ping', serverName);
          console.error('5. Verify instance name is correct:', config.server);
        } else {
          console.error('Port:', config.port || 1433);
          console.error('\nSteps to fix:');
          console.error('1. Verify SQL Server is running on', config.server, 'port', config.port || 1433);
          console.error('2. Check if firewall allows TCP connections on port', config.port || 1433);
          console.error('3. Test connectivity: ping', config.server);
          console.error('4. Verify SQL Server TCP/IP protocol is enabled');
        }
        console.error('5. Confirm SQL Server allows remote connections');
        console.error('6. Verify credentials in .env file are correct');
        console.error('7. Try connecting with SQL Server Management Studio (SSMS) to verify server is accessible');
      }
      
      console.error('\nFull error details:', err);
      poolPromise = null; // allow retry
      throw err;
    });

  return poolPromise;
}

module.exports = { sql, getPool };
