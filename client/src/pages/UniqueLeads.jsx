import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import { auth } from '../utils/auth';
import './UniqueLeads.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
const STORAGE_KEY = process.env.REACT_APP_STORAGE_KEY || 'app_auth';

const getAuthToken = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      return data?.token ?? null;
    }
  } catch (e) {
    console.error('Error getting token:', e);
  }
  return null;
};

// Expected columns (flexible matching)
const COLUMN_ALIASES = {
  dateTime: ['date with time', 'date & time', 'date and time', 'date_time', 'datetime', 'date'],
  batchCode: ['batch code', 'batchcode', 'batch'],
  name: ['name'],
  phoneNumber: ['phone number', 'phone', 'phonenumber', 'mobile', 'contact'],
  sugarPoll: ['sugar poll', 'sugar_poll', 'sugarpoll'],
  email: ['email']
};

function normalizeHeader(header) {
  if (header == null) return '';
  return String(header).trim().toLowerCase().replace(/\s+/g, ' ');
}

function mapHeaderToKey(header) {
  const n = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.some((a) => n.includes(a) || a.includes(n))) return key;
  }
  return null;
}

function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += c;
    }
  }
  if (current.trim()) lines.push(current);
  const rows = lines.map((line) => {
    const cells = [];
    let cell = '';
    inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === ',' || c === '\t') && !inQuotes) {
        cells.push(cell.trim());
        cell = '';
      } else {
        cell += c;
      }
    }
    cells.push(cell.trim());
    return cells;
  });
  return rows;
}

function parseExcelRows(rows, headers) {
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      const key = mapHeaderToKey(h);
      if (key) obj[key] = row[i] != null ? String(row[i]).trim() : '';
    });
    return obj;
  });
}

export default function UniqueLeads() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [sourceType, setSourceType] = useState('paid');
  const [rows, setRows] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [conflictModal, setConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState([]);
  const [tableViewFilter, setTableViewFilter] = useState('all'); // 'all' | 'paid' | 'youtube' | 'free' | 'last_import'
  const [dbLeads, setDbLeads] = useState([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const fileInputRef = useRef(null);

  // Load leads from DB when table view filter is a category or 'all'
  useEffect(() => {
    if (tableViewFilter === 'last_import') {
      setDbLeads([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadingDb(true);
      try {
        const token = getAuthToken();
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        if (tableViewFilter === 'all') {
          const [paidRes, youtubeRes, freeRes] = await Promise.all([
            fetch(`${API_BASE}/api/unique-leads/export?category=paid`, { headers }),
            fetch(`${API_BASE}/api/unique-leads/export?category=youtube`, { headers }),
            fetch(`${API_BASE}/api/unique-leads/export?category=free`, { headers })
          ]);
          if (paidRes.status === 401 || youtubeRes.status === 401 || freeRes.status === 401) {
            redirectToLogin();
            return;
          }
          const [paid, youtube, free] = await Promise.all([
            paidRes.ok ? paidRes.json() : [],
            youtubeRes.ok ? youtubeRes.json() : [],
            freeRes.ok ? freeRes.json() : []
          ]);
          if (!cancelled) setDbLeads([...(paid || []), ...(youtube || []), ...(free || [])]);
        } else {
          const res = await fetch(`${API_BASE}/api/unique-leads/export?category=${tableViewFilter}`, { headers });
          if (res.status === 401) {
            redirectToLogin();
            return;
          }
          if (!res.ok) throw new Error('Failed to load');
          const data = await res.json();
          if (!cancelled) setDbLeads(data || []);
        }
      } catch (e) {
        if (!cancelled) setDbLeads([]);
      } finally {
        if (!cancelled) setLoadingDb(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tableViewFilter]);

  const redirectToLogin = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    if (auth && typeof auth.logout === 'function') auth.logout();
    navigate('/login', { state: { from: '/unique-leads' }, replace: true });
  };

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError('');
    setImportResult(null);
    setRows([]);
    setFile(null);

    const ext = (f.name || '').toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.csv')) {
      setError('Please select an Excel (.xlsx) or CSV file.');
      return;
    }

    try {
      let parsedRows = [];
      if (ext.endsWith('.csv')) {
        const text = await f.text();
        const raw = parseCSV(text);
        if (raw.length < 2) {
          setError('File is empty or has no data rows.');
          return;
        }
        const headerRow = raw[0];
        const dataRows = raw.slice(1);
        const headers = headerRow.map((h) => (h != null ? String(h).trim() : ''));
        parsedRows = dataRows.map((row) => {
          const obj = {};
          headers.forEach((h, i) => {
            const key = mapHeaderToKey(h);
            if (key) obj[key] = (row[i] != null ? String(row[i]).trim() : '') || '';
          });
          return obj;
        });
      } else {
        const buf = await f.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buf);
        const sheet = workbook.worksheets[0];
        if (!sheet || sheet.rowCount < 2) {
          setError('Sheet is empty or has no data rows.');
          return;
        }
        const headerRow = [];
        sheet.getRow(1).eachCell((cell, colNumber) => {
          headerRow[colNumber - 1] = cell.value != null ? String(cell.value).trim() : '';
        });
        const dataRows = [];
        for (let r = 2; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r);
          const values = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            values[colNumber - 1] = cell.value != null ? String(cell.value).trim() : '';
          });
          dataRows.push(values);
        }
        parsedRows = parseExcelRows(dataRows, headerRow);
      }

      const required = ['dateTime', 'batchCode', 'name', 'phoneNumber', 'sugarPoll', 'email'];
      const first = parsedRows[0] || {};
      const missing = required.filter((k) => first[k] === undefined || first[k] === '');
      if (missing.length === required.length) {
        setError('Could not find expected columns. Please use: Date with Time, Batch Code, Name, Phone Number, Sugar Poll, Email.');
        return;
      }
      if (parsedRows.length > 50000) {
        setError('Maximum 50,000 rows allowed.');
        return;
      }

      setRows(parsedRows);
      setFile(f);
    } catch (err) {
      setError(err.message || 'Failed to read file.');
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setLoading(true);
    setError('');
    setImportResult(null);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/unique-leads/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sourceType, rows })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        setError(data.error || 'Import failed');
        setLoading(false);
        return;
      }
      setImportResult(data);
      if (data.conflicts && data.conflicts.length > 0) {
        setConflictData(data.conflicts);
        setConflictModal(true);
      }
    } catch (err) {
      setError(err.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const downloadCategory = async (category, label) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/api/unique-leads/export?category=${category}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        if (res.status === 401) {
          redirectToLogin();
          return;
        }
        throw new Error('Export failed');
      }
      const data = await res.json();
      const headers = ['Date & Time', 'Batch Code', 'Name', 'Phone Number', 'Sugar Poll', 'Email', 'Lead Source Type'];
      const csvRows = [
        headers.join(','),
        ...data.map((r) =>
          [
            r.dateTime ?? '',
            r.batchCode ?? '',
            (r.name ?? '').replace(/"/g, '""'),
            r.phoneNumber ?? '',
            (r.sugarPoll ?? '').replace(/"/g, '""'),
            (r.email ?? '').replace(/"/g, '""'),
            r.leadSourceType ?? ''
          ].map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')
        )
      ];
      const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Unique_Leads_${label.replace(/\s/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Download failed');
    }
  };

  const downloadConflictReport = () => {
    const headers = ['Phone Number', 'Name', 'Source Conflict', 'Existing Table Name'];
    const csvRows = [
      headers.join(','),
      ...conflictData.map((r) =>
        [
          r.phone ?? '',
          (r.name ?? '').replace(/"/g, '""'),
          r.sourceConflict ?? '',
          r.existingTableName ?? ''
        ].map((c) => (String(c).includes(',') ? `"${c}"` : c)).join(',')
      )
    ];
    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Duplicate_Leads_Report.csv';
    a.click();
    URL.revokeObjectURL(url);
    setConflictModal(false);
  };

  const previewRows = importResult?.previewRows ?? rows.slice(0, 500);
  const hasConflicts = importResult?.conflicts?.length > 0;
  // Apply filter: show last import preview or DB leads for selected category only
  const displayRows = tableViewFilter === 'last_import' ? previewRows : dbLeads;
  const displayCount = tableViewFilter === 'last_import'
    ? (importResult?.imported ?? previewRows.length)
    : dbLeads.length;

  return (
    <div className="unique-leads-container">
      <div className="unique-leads-header">
        <h1 className="unique-leads-title">Unique Leads Extraction</h1>
        <p className="unique-leads-subtitle">
          Upload Excel or CSV, classify by source (Paid / YouTube / Free), and download deduplicated lead files.
        </p>
      </div>

      {!file && (
        <div className="unique-leads-upload-zone">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileSelect}
            className="unique-leads-file-input"
          />
          <button
            type="button"
            className="unique-leads-btn-select"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Excel File
          </button>
          <p className="unique-leads-hint">Supports .xlsx and .csv (max 50,000 rows)</p>
        </div>
      )}

      {error && (
        <div className="unique-leads-alert unique-leads-alert-error" role="alert">
          {error}
        </div>
      )}

      {file && (
        <>
          <div className="unique-leads-source-section">
            <label className="unique-leads-source-label">Select Source Type:</label>
            <div className="unique-leads-source-options">
              <label className="unique-leads-radio">
                <input
                  type="radio"
                  name="sourceType"
                  value="paid"
                  checked={sourceType === 'paid'}
                  onChange={() => setSourceType('paid')}
                />
                <span>Paid</span>
              </label>
              <label className="unique-leads-radio">
                <input type="radio" name="sourceType" value="youtube" checked={sourceType === 'youtube'} onChange={() => setSourceType('youtube')} />
                <span>YouTube</span>
              </label>
              <label className="unique-leads-radio">
                <input type="radio" name="sourceType" value="free" checked={sourceType === 'free'} onChange={() => setSourceType('free')} />
                <span>Free</span>
              </label>
            </div>
            <button
              type="button"
              className="unique-leads-btn-import"
              onClick={handleImport}
              disabled={loading}
            >
              {loading ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              className="unique-leads-btn-secondary"
              onClick={() => { setFile(null); setRows([]); setError(''); }}
            >
              Choose Another File
            </button>
          </div>

          {file && !importResult && (
            <div className="unique-leads-preview-info">
              <p>{rows.length} row(s) ready. Select source type and click Import.</p>
            </div>
          )}
        </>
      )}

      <>
        <section className="unique-leads-table-section unique-leads-chart-card">
          <div className="unique-leads-card-body">
            <div className="unique-leads-table-header">
              <strong className="unique-leads-chart-title">
                <span className="unique-leads-chart-emoji" aria-hidden>📋</span>
                Imported Data Table Preview
              </strong>
              <div className="unique-leads-table-header-right">
                <small className="unique-leads-subtitle-text">Deduplicated leads by source (Paid / YouTube / Free)</small>
                <label className="unique-leads-filter-label">
                  <span className="small fw-semibold text-secondary">Show:</span>
                  <select
                    className="form-select form-select-sm unique-leads-view-filter"
                    value={tableViewFilter}
                    onChange={(e) => setTableViewFilter(e.target.value)}
                    aria-label="Filter table by source"
                  >
                    <option value="all">All Imported Leads</option>
                    <option value="paid">Paid leads only</option>
                    <option value="youtube">YouTube leads only</option>
                    <option value="free">Free leads only</option>
                    <option value="last_import">Last Import</option>
                  </select>
                </label>
              </div>
            </div>
            <p className="unique-leads-meta">
              {tableViewFilter === 'last_import'
                ? (importResult
                  ? `Imported ${importResult.imported} lead(s).${previewRows.length < (importResult.previewRows?.length ?? rows.length) ? ` Showing first ${previewRows.length} rows.` : ''}`
                  : 'No data yet. Import a file to see leads.')
                : tableViewFilter === 'all'
                  ? `Showing all imported leads (${displayCount} total).${loadingDb ? ' Loading…' : ''}`
                  : `Showing ${tableViewFilter === 'youtube' ? 'YouTube' : tableViewFilter} lead(s) from database.${loadingDb ? ' Loading…' : ''} (${displayCount} total)`}
            </p>
            <div className="unique-leads-table-responsive">
              <table className="table table-hover align-middle unique-leads-table mb-0">
                <thead className="unique-leads-thead">
                  <tr>
                    <th>Date & Time</th>
                    <th>Batch Code</th>
                    <th>Name</th>
                    <th>Phone Number</th>
                    <th>Sugar Poll</th>
                    <th>Email</th>
                    <th>Lead Source Type</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDb ? (
                    <tr><td colSpan={7} className="text-center py-4 text-secondary">Loading…</td></tr>
                  ) : displayRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-4 text-secondary">No data to display. Import a file or select a category above.</td></tr>
                  ) : (
                    displayRows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.dateTime ?? row.date_time ?? ''}</td>
                        <td>{row.batchCode ?? row.batch_code ?? ''}</td>
                        <td>{row.name ?? ''}</td>
                        <td>{row.phoneNumber ?? row.phone ?? ''}</td>
                        <td>{row.sugarPoll ?? row.sugar_poll ?? ''}</td>
                        <td>{row.email ?? ''}</td>
                        <td>{row.leadSourceType ?? sourceType}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="unique-leads-downloads unique-leads-chart-card">
          <div className="unique-leads-card-body">
            <strong className="unique-leads-chart-title">
              <span className="unique-leads-chart-emoji" aria-hidden>⬇️</span>
              Download Leads by Category
            </strong>
            <div className="unique-leads-download-btns">
              <button type="button" className="unique-leads-btn-download" onClick={() => downloadCategory('paid', 'Paid Leads')}>
                Download Paid Leads
              </button>
              <button type="button" className="unique-leads-btn-download" onClick={() => downloadCategory('youtube', 'YouTube Leads')}>
                Download YouTube Leads
              </button>
              <button type="button" className="unique-leads-btn-download" onClick={() => downloadCategory('free', 'Free Leads')}>
                Download Free Leads
              </button>
              {hasConflicts && (
                <button type="button" className="unique-leads-btn-download unique-leads-btn-conflict" onClick={() => setConflictModal(true)}>
                  Download Duplicate Leads Report
                </button>
              )}
            </div>
          </div>
          </section>
      </>

      {conflictModal && (
        <div className="unique-leads-modal-backdrop" onClick={() => setConflictModal(false)}>
          <div className="unique-leads-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Duplicate conflict</h3>
            <p>Some leads already exist in a higher-priority table. Do you want to download the duplicate report?</p>
            <div className="unique-leads-modal-actions">
              <button type="button" className="unique-leads-btn-download" onClick={downloadConflictReport}>
                Download Duplicate File
              </button>
              <button type="button" className="unique-leads-btn-secondary" onClick={() => setConflictModal(false)}>
                Skip & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
