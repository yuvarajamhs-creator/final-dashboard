require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { supabase, verifyTableExists } = require('./supabase');
const { signToken, hashPassword, comparePassword, authMiddleware } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// Import Meta routes
const metaRoutes = require("./meta/meta.jsx");
app.use("/api/meta", metaRoutes);

app.get("/", (req, res) => {
  res.send("Backend is running...");
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 4000
  });
});

// //const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => {
//   console.log(`Server listening on port ${PORT}`);
// });

// --- AUTH: signup
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, fullName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    if (!supabase) {
      return res.status(500).json({ 
        error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env' 
      });
    }

    // Verify table exists (but don't block on schema cache issues)
    const tableCheck = await verifyTableExists('users');
    if (!tableCheck.exists && !tableCheck.error?.includes('schema cache')) {
      console.error('Table check failed:', tableCheck.error);
      return res.status(500).json({ 
        error: 'Database table not found. Please create the users table in Supabase.',
        details: 'Run the SQL from server/supabase-complete-schema.sql in your Supabase SQL Editor',
        help: 'Go to Supabase Dashboard → SQL Editor → New Query → Paste SQL from supabase-complete-schema.sql → Run'
      });
    }

    // Check if user already exists (using lowercase table and column names)
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    // Handle check error (but allow "not found" errors to continue)
    if (checkError) {
      console.error('Error checking existing user:', checkError);
      
      // Provide specific guidance for schema cache errors
      if (checkError.code === 'PGRST116' || checkError.message?.includes('schema cache') || checkError.message?.includes('Could not find the table')) {
        return res.status(500).json({ 
          error: 'Schema cache error: Could not find the table \'public.users\' in the schema cache',
          details: 'The users table exists but PostgREST schema cache needs to be refreshed',
          solution: {
            step1: 'Go to Supabase Dashboard → Settings → API',
            step2: 'Scroll to "Schema" section and click "Reload schema"',
            step3: 'Wait 10-30 seconds, then try again',
            alternative: 'OR run this SQL in SQL Editor: SELECT pg_notify(\'pgrst\', \'reload schema\');',
            verify: 'Run: npm run check-users-table to verify table access'
          },
          help: 'See server/STEP_BY_STEP_FIX.md for detailed instructions'
        });
      }
      
      return res.status(500).json({ error: 'Database error: ' + checkError.message });
    }

    // If user exists
    if (existingUser) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashed = await hashPassword(password);

    // Insert user into Supabase (using lowercase table and column names)
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([
        {
          email: email,
          password_hash: hashed,
          full_name: fullName || null,
          role: 'user'
        }
      ])
      .select('id, email, full_name')
      .single();

    if (insertError) {
      console.error('Supabase signup error:', insertError);
      
      // Provide helpful error messages
      if (insertError.code === 'PGRST116' || insertError.message?.includes('schema cache')) {
        return res.status(500).json({ 
          error: 'Schema cache issue. The table exists but PostgREST cache needs refresh.',
          details: 'PostgREST schema cache needs to be refreshed',
          help: [
            '1. Go to Supabase Dashboard → Settings → API',
            '2. Click "Reload schema" or wait 30-60 seconds',
            '3. OR run: SELECT pg_notify(\'pgrst\', \'reload schema\'); in SQL Editor',
            '4. OR check if table is exposed: Database → Tables → users → API Settings'
          ]
        });
      }
      
      return res.status(500).json({ 
        error: 'Failed to create user: ' + insertError.message,
        code: insertError.code,
        details: insertError.details || 'Check server logs for more details'
      });
    }

    const token = signToken({ id: newUser.id, email: newUser.email });
    res.json({ 
      token, 
      user: { 
        id: newUser.id, 
        email: newUser.email, 
        fullName: newUser.full_name 
      } 
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// --- AUTH: login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  try {
    if (!supabase) {
      return res.status(500).json({ 
        error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env' 
      });
    }

    // Get user from Supabase (using lowercase table and column names)
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, email, password_hash, full_name')
      .eq('email', email)
      .maybeSingle();

    if (fetchError) {
      console.error('Login error:', fetchError);
      if (fetchError.code === 'PGRST116') {
        return res.status(500).json({ 
          error: 'Table not found. Please create the users table in Supabase.',
          details: 'Run the SQL from server/supabase-complete-schema.sql in your Supabase SQL Editor'
        });
      }
      return res.status(500).json({ error: 'Database error: ' + fetchError.message });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Compare password
    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ id: user.id, email: user.email });
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        email: user.email, 
        fullName: user.full_name 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// --- Protected example: get current user
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('id', req.user.id)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      id: user.id, 
      email: user.email, 
      FullName: user.full_name 
    });
  } catch (e) {
    console.error('Get user error:', e);
    res.status(500).json({ error: 'Server error: ' + e.message });
  }
});

// --- Ads endpoints (public read; require auth if you want)
app.get('/api/ads', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const days = Number(req.query.days) || 30;
    const includeLeads = req.query.includeLeads === '1' || req.query.includeLeads === 'true';
    const since = (() => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1));
      return d.toISOString().slice(0,10);
    })();

    // Query ads from Supabase
    // Note: Table name is 'Ads' (capitalized) with capitalized column names
    const { data: rows, error: adsError } = await supabase
      .from('Ads')
      .select('Id, Campaign, DateChar, Leads, Spend, ActionsJson')
      .gte('DateChar', since)
      .order('DateChar', { ascending: true });

    if (adsError) {
      console.error('Error fetching ads:', adsError);
      return res.status(500).json({ error: 'Database error: ' + adsError.message });
    }

    // Transform to match expected format (camelCase for compatibility)
    // Note: Supabase returns capitalized column names
    const ads = (rows || []).map(r => ({
      Id: r.Id,
      id: r.Id,
      Campaign: r.Campaign,
      campaign: r.Campaign,
      date: r.DateChar,
      DateChar: r.DateChar,
      Leads: r.Leads,
      leads: r.Leads,
      Spend: r.Spend,
      spend: r.Spend,
      actions: typeof r.ActionsJson === 'string' ? JSON.parse(r.ActionsJson || '{}') : (r.ActionsJson || {}),
      ActionsJson: undefined
    }));

    // Include lead details if requested
    if (includeLeads) {
      for (const a of ads) {
        // Note: Table name is 'Leads' (capitalized) with mixed column names
        const { data: leadRows, error: leadsError } = await supabase
          .from('Leads')
          .select('Id, Name, Phone, TimeUtc, DateChar, Campaign')
          .eq('DateChar', a.date)
          .eq('Campaign', a.campaign)
          .order('TimeUtc', { ascending: false });

        if (!leadsError && leadRows) {
          // Transform leads to match expected format
          // Note: Supabase returns capitalized column names
          a.lead_details = leadRows.map(l => ({
            Id: l.Id,
            id: l.Id,
            Name: l.Name,
            name: l.Name,
            Phone: l.Phone,
            phone: l.Phone,
            Time: l.TimeUtc,
            TimeUtc: l.TimeUtc,
            Date: l.DateChar,
            DateChar: l.DateChar,
            Campaign: l.Campaign,
            campaign: l.Campaign
          }));
        }
      }
    }

    res.json(ads);
  } catch (err) {
    console.error('Error fetching ads:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// /api/leads?page=1&perPage=10&campaign=Alpha (paginated)
app.get('/api/leads', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.max(1, Number(req.query.perPage) || 10);
    const campaign = req.query.campaign || null;
    const offset = (page - 1) * perPage;

    // Build query
    // Note: Table name is 'Leads' (capitalized) with mixed column names
    let countQuery = supabase.from('Leads').select('*', { count: 'exact', head: true });
    let rowsQuery = supabase
      .from('Leads')
      .select('Id, Name, Phone, TimeUtc, DateChar, Campaign')
      .order('TimeUtc', { ascending: false })
      .range(offset, offset + perPage - 1);

    // Apply campaign filter if provided
    if (campaign) {
      countQuery = countQuery.eq('Campaign', campaign);
      rowsQuery = rowsQuery.eq('Campaign', campaign);
    }

    // Execute queries
    const [countResult, rowsResult] = await Promise.all([
      countQuery,
      rowsQuery
    ]);

    if (countResult.error) {
      console.error('Error counting leads:', countResult.error);
      return res.status(500).json({ error: 'Database error: ' + countResult.error.message });
    }

    if (rowsResult.error) {
      console.error('Error fetching leads:', rowsResult.error);
      return res.status(500).json({ error: 'Database error: ' + rowsResult.error.message });
    }

    const total = countResult.count || 0;

    // Transform rows to match expected format (camelCase for compatibility)
    // Note: Supabase returns capitalized column names
    const rows = (rowsResult.data || []).map(r => ({
      Id: r.Id,
      id: r.Id,
      Name: r.Name,
      name: r.Name,
      Phone: r.Phone,
      phone: r.Phone,
      Time: r.TimeUtc,
      TimeUtc: r.TimeUtc,
      Date: r.DateChar,
      DateChar: r.DateChar,
      Campaign: r.Campaign,
      campaign: r.Campaign
    }));

    res.json({ total, page, perPage, rows });
  } catch (err) {
    console.error('Error fetching leads:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// campaigns list
app.get('/api/campaigns', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Get distinct campaigns from ads table
    // Note: Table name is 'Ads' (capitalized) in Supabase
    const { data, error } = await supabase
      .from('Ads')
      .select('Campaign');

    if (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: 'Database error: ' + error.message });
    }

    // Extract unique campaign names
    // Note: Column name is 'Campaign' (capitalized)
    const campaigns = [...new Set((data || []).map(x => x.Campaign).filter(Boolean))].sort();
    res.json(campaigns);
  } catch (err) {
    console.error('Error fetching campaigns:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// actions list
app.get('/api/actions', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }

    // Get all actions_json from ads table
    // Note: Table name is 'Ads' (capitalized) in Supabase
    const { data, error } = await supabase
      .from('Ads')
      .select('ActionsJson');

    if (error) {
      console.error('Error fetching actions:', error);
      return res.status(500).json({ error: 'Database error: ' + error.message });
    }

    // Extract unique action keys from JSONB
    // Note: Column name is 'ActionsJson' (capitalized)
    const set = new Set();
    (data || []).forEach(row => {
      try {
        const obj = typeof row.ActionsJson === 'string' 
          ? JSON.parse(row.ActionsJson || '{}') 
          : (row.ActionsJson || {});
        Object.keys(obj).forEach(k => set.add(k));
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    res.json(Array.from(set));
  } catch (err) {
    console.error('Error fetching actions:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Google Sheets revenue metrics endpoint
app.get('/api/google-sheets/revenue-metrics', async (req, res) => {
  try {
    // Google Sheets ID for Ads Analytics Dashboard
    // Sheet: https://docs.google.com/spreadsheets/d/1Mk0CMlGqp-iR8KDvWqIwf1Z__TYjjJs6E0Q0pOHnWv4/edit?gid=0#gid=0
    const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1Mk0CMlGqp-iR8KDvWqIwf1Z__TYjjJs6E0Q0pOHnWv4';
    const GID = '0'; // Default sheet
    
    // Try multiple URL formats for Google Sheets export
    const urlFormats = [
      // Standard export format (works with published sheets)
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`,
      // Alternative format (sometimes works with shared sheets)
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`,
      // Simple export format
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`
    ];
    
    let response = null;
    let lastError = null;
    
    // Try each URL format until one works
    for (const csvUrl of urlFormats) {
      try {
        response = await axios.get(csvUrl, {
          timeout: 10000, // 10 second timeout
          headers: {
            'Accept': 'text/csv,text/plain,*/*',
            'User-Agent': 'Mozilla/5.0'
          },
          maxRedirects: 5
        });
        
        // If we got a response (even if 401), break and use it
        if (response.status === 200 && response.data) {
          break;
        }
      } catch (err) {
        lastError = err;
        // Continue to next URL format
        continue;
      }
    }
    
    // If all formats failed, throw error with helpful message
    if (!response || response.status !== 200) {
      throw new Error(
        'Unable to access Google Sheet. Please ensure the sheet is "Published to the web": ' +
        '1. Open your Google Sheet\n' +
        '2. Click File > Share > Publish to web\n' +
        '3. Select "Web page" and click "Publish"\n' +
        '4. Alternatively, share the sheet with "Anyone with the link can view"'
      );
    }
    
    // Parse CSV data
    const lines = response.data.split('\n').filter(line => line.trim());
    
    // Skip header row (row 1), get data row (row 2)
    if (lines.length < 2) {
      throw new Error('Insufficient data in spreadsheet');
    }
    
    // Parse CSV row (handle quoted values and commas)
    const parseCsvRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    // Find header row and data row
    // Headers are typically in the first row, data in subsequent rows
    const headerRow = parseCsvRow(lines[0] || '');
    let dataRow = null;
    let dataRowIndex = 1;
    
    // Try to find the data row (skip empty rows)
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvRow(lines[i]);
      if (row.some(cell => cell && cell.trim() !== '')) {
        dataRow = row;
        dataRowIndex = i;
        break;
      }
    }
    
    if (!dataRow || dataRow.length === 0) {
      throw new Error('No data found in spreadsheet');
    }
    
    // Remove commas and convert to numbers
    const parseNumber = (value) => {
      if (!value || value === '') return 0;
      // Remove commas, currency symbols, and whitespace
      const cleaned = value.toString().replace(/[₹,\s]/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };
    
    // Find column indices by header names (case-insensitive)
    const findColumnIndex = (headerName) => {
      const lowerHeader = headerName.toLowerCase();
      for (let i = 0; i < headerRow.length; i++) {
        if (headerRow[i] && headerRow[i].toLowerCase().includes(lowerHeader)) {
          return i;
        }
      }
      return -1;
    };
    
    // Try to find columns by common names
    // Ads Analytics Sheet structure: A=Online Conversion, B=Offline Conversion, C=L1 Revenue, D=L2 Revenue, E=Total Revenue
    const onlineConvIdx = findColumnIndex('online') >= 0 ? findColumnIndex('online') : 0;
    const offlineConvIdx = findColumnIndex('offline') >= 0 ? findColumnIndex('offline') : 1;
    const l1RevIdx = findColumnIndex('l1') >= 0 ? findColumnIndex('l1') : 2;
    const l2RevIdx = findColumnIndex('l2') >= 0 ? findColumnIndex('l2') : 3;
    const totalRevIdx = findColumnIndex('total') >= 0 ? findColumnIndex('total') : 4;
    
    // Extract values - use column indices if found, otherwise fall back to positional
    // Note: Organic Leads and Organic Revenue are not in Ads Analytics sheet, return 0
    const metrics = {
      onlineConversion: parseNumber(dataRow[onlineConvIdx] || dataRow[0] || '0'),
      offlineConversion: parseNumber(dataRow[offlineConvIdx] || dataRow[1] || '0'),
      l1Revenue: parseNumber(dataRow[l1RevIdx] || dataRow[2] || '0'),
      l2Revenue: parseNumber(dataRow[l2RevIdx] || dataRow[3] || '0'),
      totalRevenue: parseNumber(dataRow[totalRevIdx] || dataRow[4] || '0'),
      organicLeads: 0, // Not in Ads Analytics sheet
      organicRevenue: 0 // Not in Ads Analytics sheet
    };
    
    console.log('[Google Sheets] Parsed metrics:', {
      headerRow: headerRow.slice(0, 10),
      dataRow: dataRow.slice(0, 10),
      metrics
    });
    
    res.json(metrics);
  } catch (err) {
    console.error('Error fetching Google Sheets data:', err.message);
    console.error('Full error:', err.response?.data || err.response?.status || err);
    
    // Provide helpful error message
    let errorMessage = err.message;
    if (err.response?.status === 401) {
      errorMessage = 'Google Sheet is not publicly accessible. Please: 1) Open the sheet, 2) Click File > Share > Publish to web, 3) Click Publish, 4) Ensure "Web page" is selected';
    } else if (err.response?.status === 403) {
      errorMessage = 'Access denied. Please share the sheet with "Anyone with the link can view" or publish it to web.';
    }
    
    // Return zeros as fallback values with error message
    res.json({
      onlineConversion: 0,
      offlineConversion: 0,
      l1Revenue: 0,
      l2Revenue: 0,
      totalRevenue: 0,
      organicLeads: 0,
      organicRevenue: 0,
      error: errorMessage
    });
  }
});

// Google Sheets Content Marketing revenue endpoint
// Reads summary row (row 2) with pre-calculated totals
app.get('/api/google-sheets/content-marketing-revenue', async (req, res) => {
  try {
    const SHEET_ID = process.env.CONTENT_MARKETING_SHEET_ID || '1fUdW8r0125GXQayXsEgD4Bt2nzaqBN8_vPuGWOIpONw';
    const GID = '1908867041'; // Sheet GID from the URL
    
    // Try multiple URL formats for Google Sheets export
    const urlFormats = [
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`,
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`,
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`
    ];
    
    let response = null;
    
    // Try each URL format until one works
    for (const csvUrl of urlFormats) {
      try {
        response = await axios.get(csvUrl, {
          timeout: 10000,
          headers: {
            'Accept': 'text/csv,text/plain,*/*',
            'User-Agent': 'Mozilla/5.0'
          },
          maxRedirects: 5
        });
        
        if (response.status === 200 && response.data) {
          break;
        }
      } catch (err) {
        continue;
      }
    }
    
    if (!response || response.status !== 200) {
      throw new Error(
        'Unable to access Google Sheet. Please ensure the sheet is "Published to the web"'
      );
    }
    
    // Parse CSV data
    const lines = response.data.split('\n').filter(line => line.trim());
    
    // Need at least header row (row 1) and summary row (row 2)
    if (lines.length < 2) {
      throw new Error('Insufficient data in spreadsheet. Expected at least header row and summary row.');
    }
    
    // Parse CSV row (handle quoted values and commas)
    const parseCsvRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    // Parse number helper - handles commas, currency symbols, and percentages
    const parseNumber = (value) => {
      if (!value || value === '') return 0;
      // Remove currency symbols, commas, whitespace, and percentage signs
      let cleaned = value.toString().replace(/[₹$,\s%]/g, '');
      // If it was a percentage, we might want to handle it differently
      // For now, just parse as number
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    };
    
    // Parse header row (row 1)
    const headerRow = parseCsvRow(lines[0] || '');
    
    // Parse summary row (row 2)
    const summaryRow = parseCsvRow(lines[1] || '');
    
    console.log('[Content Marketing Revenue] Header row:', headerRow);
    console.log('[Content Marketing Revenue] Summary row:', summaryRow);
    
    // Find column indices dynamically by matching header names (case-insensitive)
    const findColumnIndex = (headerName) => {
      const lowerHeader = headerName.toLowerCase();
      for (let i = 0; i < headerRow.length; i++) {
        const cell = (headerRow[i] || '').toLowerCase();
        if (cell.includes(lowerHeader)) {
          return i;
        }
      }
      return -1;
    };
    
    // Find column indices
    const organicLeadsIdx = findColumnIndex('Organic Leads');
    const conversionsLeadsIdx = findColumnIndex('Conversions Leads');
    const organicConversionIdx = findColumnIndex('Organic Conversion');
    const l1RevenueIdx = findColumnIndex('L1 Revenue Organic');
    const l2RevenueIdx = findColumnIndex('L2 Revenue Organic');
    const totalRevenueIdx = findColumnIndex('Total Organic Revenue');
    
    console.log('[Content Marketing Revenue] Column indices:', {
      organicLeadsIdx,
      conversionsLeadsIdx,
      organicConversionIdx,
      l1RevenueIdx,
      l2RevenueIdx,
      totalRevenueIdx
    });
    
    // Extract values from summary row
    const organicLeads = organicLeadsIdx >= 0 ? parseNumber(summaryRow[organicLeadsIdx] || '0') : 0;
    
    // For Organic Conversion, prefer "Organic Conversion" column, fallback to "Conversions Leads"
    let organicConversion = 0;
    if (organicConversionIdx >= 0 && summaryRow[organicConversionIdx]) {
      organicConversion = parseNumber(summaryRow[organicConversionIdx]);
    } else if (conversionsLeadsIdx >= 0) {
      organicConversion = parseNumber(summaryRow[conversionsLeadsIdx] || '0');
    }
    
    const l1Revenue = l1RevenueIdx >= 0 ? parseNumber(summaryRow[l1RevenueIdx] || '0') : 0;
    const l2Revenue = l2RevenueIdx >= 0 ? parseNumber(summaryRow[l2RevenueIdx] || '0') : 0;
    
    // For Total Revenue, prefer the column value, otherwise calculate from L1 + L2
    let totalRevenue = 0;
    if (totalRevenueIdx >= 0 && summaryRow[totalRevenueIdx]) {
      const totalValue = summaryRow[totalRevenueIdx];
      // Check if it's a percentage (e.g., "12.65%")
      if (totalValue.toString().includes('%')) {
        // If it's a percentage, calculate from L1 + L2 instead
        totalRevenue = l1Revenue + l2Revenue;
      } else {
        totalRevenue = parseNumber(totalValue);
        // If parsed value is 0 but we have revenue, use sum instead
        if (totalRevenue === 0 && (l1Revenue > 0 || l2Revenue > 0)) {
          totalRevenue = l1Revenue + l2Revenue;
        }
      }
    } else {
      // Calculate from L1 + L2 if column not found
      totalRevenue = l1Revenue + l2Revenue;
    }
    
    console.log('[Content Marketing Revenue] Extracted values:', {
      organicLeads,
      organicConversion,
      l1Revenue,
      l2Revenue,
      totalRevenue
    });
    
    res.json({
      organicLeads,
      organicConversion,
      l1Revenue,
      l2Revenue,
      totalRevenue
    });
  } catch (err) {
    console.error('Error fetching Content Marketing revenue:', err.message);
    console.error('Full error:', err.response?.data || err.response?.status || err);
    
    let errorMessage = err.message;
    if (err.response?.status === 401) {
      errorMessage = 'Google Sheet is not publicly accessible. Please publish it to web.';
    } else if (err.response?.status === 403) {
      errorMessage = 'Access denied. Please share the sheet with "Anyone with the link can view".';
    }
    
    // Return zeros with error message
    res.json({
      organicLeads: 0,
      organicConversion: 0,
      l1Revenue: 0,
      l2Revenue: 0,
      totalRevenue: 0,
      error: errorMessage
    });
  }
});

// Initialize leads sync scheduler
const { startLeadsSyncScheduler } = require('./jobs/leadsSync');
let leadsSyncIntervalId = null;

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  
  // Start leads sync scheduler
  try {
    leadsSyncIntervalId = startLeadsSyncScheduler();
    if (leadsSyncIntervalId) {
      console.log('✅ Leads sync scheduler started successfully (runs every 15 minutes)');
    } else {
      console.warn('⚠️  Leads sync scheduler not started - META_PAGE_ID not configured');
      console.warn('   Add META_PAGE_ID to server/.env to enable automatic leads syncing');
    }
  } catch (error) {
    console.error('Error starting leads sync scheduler:', error.message);
  }
});
