import { useState, useEffect, useCallback, useRef } from 'react';
import './AIInsights.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';

const getAuthToken = () => {
    try {
        const STORAGE_KEY = process.env.REACT_APP_STORAGE_KEY || 'app_auth';
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

const toYMD = (d) => d.toISOString().slice(0, 10);

/** Broad range covering last month + this month so we have data for all 4 periods */
const getBroadRange = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 34);
    return { from: toYMD(startDate), to: toYMD(endDate) };
};

/** Period ranges for Last Month, Last Week, This Week, Today (for tabs) */
const getPeriodRanges = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday;
    const lastMonth = { from: '', to: '' };
    const lastMonthStart = new Date(y.getFullYear(), y.getMonth() - 1, 1);
    const lastMonthEnd = new Date(y.getFullYear(), y.getMonth(), 0);
    lastMonth.from = toYMD(lastMonthStart);
    lastMonth.to = toYMD(lastMonthEnd);

    const lastWeek = { from: '', to: '' };
    const lastWeekEnd = new Date(y);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    lastWeek.from = toYMD(lastWeekStart);
    lastWeek.to = toYMD(lastWeekEnd);

    const thisWeek = { from: '', to: '' };
    const thisWeekStart = new Date(y);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeek.from = toYMD(thisWeekStart);
    thisWeek.to = toYMD(y);

    const todayRange = { from: toYMD(y), to: toYMD(y) };

    return { lastMonth, lastWeek, thisWeek, today: todayRange };
};

const rowOverlapsPeriod = (row, period) => {
    const start = row.date_start || row.date;
    const stop = row.date_stop || row.date_start || row.date;
    if (!start || !stop || !period.from || !period.to) return false;
    return start <= period.to && stop >= period.from;
};

const DATE_PRESETS = [
    { id: 'all_periods', label: 'All periods (Month / Week / Today)' },
    { id: 'last_7_days', label: 'Last 7 days' },
    { id: 'last_14_days', label: 'Last 14 days' },
    { id: 'last_30_days', label: 'Last 30 days' },
    { id: 'this_week', label: 'This week' },
    { id: 'last_week', label: 'Last week' },
    { id: 'this_month', label: 'This month' },
    { id: 'last_month', label: 'Last month' }
];

const getDateRangeForPreset = (presetId) => {
    const today = new Date();
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    if (presetId === 'last_7_days') {
        const start = new Date(y);
        start.setDate(start.getDate() - 6);
        return { from: toYMD(start), to: toYMD(y) };
    }
    if (presetId === 'last_14_days') {
        const start = new Date(y);
        start.setDate(start.getDate() - 13);
        return { from: toYMD(start), to: toYMD(y) };
    }
    if (presetId === 'last_30_days') {
        const start = new Date(y);
        start.setDate(start.getDate() - 29);
        return { from: toYMD(start), to: toYMD(y) };
    }
    if (presetId === 'this_week') {
        const start = new Date(y);
        start.setDate(start.getDate() - start.getDay());
        return { from: toYMD(start), to: toYMD(y) };
    }
    if (presetId === 'last_week') {
        const end = new Date(y);
        end.setDate(end.getDate() - end.getDay() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        return { from: toYMD(start), to: toYMD(end) };
    }
    if (presetId === 'this_month') {
        const start = new Date(y.getFullYear(), y.getMonth(), 1);
        return { from: toYMD(start), to: toYMD(y) };
    }
    if (presetId === 'last_month') {
        const start = new Date(y.getFullYear(), y.getMonth() - 1, 1);
        const end = new Date(y.getFullYear(), y.getMonth(), 0);
        return { from: toYMD(start), to: toYMD(end) };
    }
    return null;
};

const PLATFORM_OPTIONS = [
    { id: 'all', label: 'All' },
    { id: 'ads', label: 'Ads only' },
    { id: 'reels', label: 'Reels only' }
];

const LOCATION_OPTIONS = [
    { id: 'all', label: 'All Locations' },
    { id: 'in', label: 'India' },
    { id: 'us', label: 'United States' },
    { id: 'uk', label: 'United Kingdom' }
];

const AGE_OPTIONS = [
    { id: 'all', label: 'All Age Groups' },
    { id: '18-24', label: '18-24' },
    { id: '25-34', label: '25-34' },
    { id: '35-44', label: '35-44' },
    { id: '45-54', label: '45-54' },
    { id: '55+', label: '55+' }
];

const transformActions = (actions = []) => {
    if (!Array.isArray(actions)) return {};
    const map = {};
    actions.forEach((a) => {
        const key = a.action_type;
        const val = a.value != null ? Number(a.value) : (a.values ? Number(a.values[0]) : 0);
        if (key) map[key] = val;
    });
    return map;
};

const num = (v) => Number(v) || 0;

const fetchAdAccounts = async () => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/meta/ad-accounts`, { headers });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : (data?.data || []);
    } catch (e) {
        return [];
    }
};

const fetchInsightsForAI = async (from, to) => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        // No ad_account_id = fetch from ALL ad accounts (same as Best Performing Ad "All Projects")
        const url = `${API_BASE}/api/meta/insights?time_increment=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&is_all_campaigns=1&is_all_ads=1&live=1`;
        const res = await fetch(url, { headers });
        if (!res.ok) return [];
        let data = await res.json();
        if (data && !Array.isArray(data) && Array.isArray(data.data)) data = data.data;
        if (!Array.isArray(data)) return [];
        return data.map((d) => {
            const aggs = transformActions(d.actions || []);
            const leadCount =
                aggs['lead'] ||
                aggs['on_facebook_lead'] ||
                aggs['onsite_conversion.lead_grouped'] ||
                (Object.keys(aggs || {}).filter((k) => String(k).toLowerCase().includes('lead')).reduce((s, k) => s + (Number(aggs[k]) || 0), 0)) ||
                0;
            const spend = num(d.spend);
            const cpl = leadCount > 0 ? spend / leadCount : 0;
            return {
                ad_id: d.ad_id,
                ad_name: d.ad_name || 'Unnamed Ad',
                campaign_id: d.campaign_id,
                campaign_name: d.campaign_name || 'Unknown Campaign',
                ad_account_id: d.ad_account_id,
                ad_account_name: d.ad_account_name || '',
                spend,
                leads: leadCount,
                cpl,
                impressions: num(d.impressions),
                clicks: num(d.clicks),
                date_start: d.date_start || d.date,
                date_stop: d.date_stop || d.date_start || d.date
            };
        });
    } catch (e) {
        return [];
    }
};

const fetchPages = async () => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/meta/pages`, { headers });
        if (!res.ok) return [];
        const data = await res.json();
        return data?.data || [];
    } catch (e) {
        return [];
    }
};

const fetchMediaInsightsForAI = async (pageId) => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/meta/instagram/media-insights?pageIds=${encodeURIComponent(pageId)}`, { headers });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

const pickBestAd = (rows) => {
    if (!rows || rows.length === 0) return null;
    const adMap = {};
    rows.forEach((r) => {
        const key = String(r.ad_id || r.ad_name || 'unknown').trim() || 'unknown';
        if (!adMap[key]) {
            adMap[key] = {
                name: (r.ad_name && String(r.ad_name).trim()) ? r.ad_name.trim() : (r.ad_id ? `Ad ${r.ad_id}` : 'Unknown'),
                campaignName: r.campaign_name || 'Campaign',
                platform: 'Meta',
                spend: 0,
                leads: 0,
                ad_account_name: r.ad_account_name || ''
            };
        }
        adMap[key].spend += r.spend || 0;
        adMap[key].leads += r.leads || 0;
    });
    const aggregated = Object.values(adMap).map((d) => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
    }));
    aggregated.sort((a, b) => {
        const leadDiff = (b.leads || 0) - (a.leads || 0);
        if (leadDiff !== 0) return leadDiff;
        const cplDiff = (a.cpl || 0) - (b.cpl || 0);
        if (cplDiff !== 0) return cplDiff;
        return (b.spend || 0) - (a.spend || 0);
    });
    const best = aggregated[0];
    return best ? { name: best.name, campaignName: best.campaignName, platform: best.platform, spend: best.spend, leads: best.leads, cpl: Math.round(best.cpl * 100) / 100, ad_account_name: best.ad_account_name || undefined } : null;
};

const pickBestReel = (mediaPayload, period = null) => {
    const media = mediaPayload?.media || [];
    let reels = media.filter((m) => (m.product_type === 'REELS' || (m.media_type === 'VIDEO' && (m.permalink || '').includes('/reel/'))) && (m.availability === 'available' || (m.views || m.reach) > 0));
    if (period && period.from && period.to) {
        reels = reels.filter((m) => {
            const ts = m.timestamp;
            if (!ts) return true;
            const d = new Date(ts);
            const ymd = toYMD(d);
            return ymd >= period.from && ymd <= period.to;
        });
    }
    if (reels.length === 0) return null;
    const sorted = [...reels].sort((a, b) => (b.reach || b.views || 0) - (a.reach || a.views || 0));
    const top = sorted[0];
    const reach = Number(top.reach) || Number(top.views) || 0;
    const engagements = Number(top.total_interactions) || (Number(top.likes) + Number(top.comments)) || 0;
    const saves = Number(top.saved) || 0;
    const name = (top.caption && top.caption.slice(0, 80)) || 'Reel';
    return { name, platform: 'Instagram', reach, engagements, saves, caption: top.caption, permalink: top.permalink };
};

const defaultAdsData = {
    lastMonth: { name: '—', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'Loading…', action: 'MONITOR' },
    lastWeek: { name: '—', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'Loading…', action: 'MONITOR' },
    thisWeek: { name: '—', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'Loading…', action: 'MONITOR' },
    today: { name: '—', platform: 'Meta', spend: 0, leads: 0, cpl: 0, reason: 'Loading…', action: 'MONITOR' }
};

const defaultReelsData = {
    lastMonth: { name: '—', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'Loading…', action: 'MONITOR' },
    lastWeek: { name: '—', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'Loading…', action: 'MONITOR' },
    thisWeek: { name: '—', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'Loading…', action: 'MONITOR' },
    today: { name: '—', platform: 'Instagram', reach: 0, engagements: 0, saves: 0, reason: 'Loading…', action: 'MONITOR' }
};

export default function AIInsights() {
    const [activeTimeWindow, setActiveTimeWindow] = useState('lastWeek');
    const [datePreset, setDatePreset] = useState('all_periods');
    const [platformFilter, setPlatformFilter] = useState('all');
    const [locationFilter, setLocationFilter] = useState('all');
    const [ageFilter, setAgeFilter] = useState('all');
    const [dropdownOpen, setDropdownOpen] = useState({ date: false, platform: false, location: false, age: false });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [adsData, setAdsData] = useState(defaultAdsData);
    const [reelsData, setReelsData] = useState(defaultReelsData);
    const [insights, setInsights] = useState([]);
    const [recommendations, setRecommendations] = useState([]);

    const fetchAIInsights = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const useSingleRange = datePreset !== 'all_periods' && getDateRangeForPreset(datePreset);
            let bestAds;
            let bestReels;
            let dateRange;

            if (useSingleRange) {
                const { from, to } = useSingleRange;
                dateRange = { from, to };
                const insightsRows = await fetchInsightsForAI(from, to);
                const bestAd = pickBestAd(insightsRows);
                let mediaPayload = null;
                const pages = await fetchPages();
                const pageId = pages && pages[0] ? (pages[0].id || pages[0].page_id || '') : null;
                if (pageId) mediaPayload = await fetchMediaInsightsForAI(pageId);
                const bestReel = pickBestReel(mediaPayload);
                bestAds = { lastMonth: bestAd, lastWeek: bestAd, thisWeek: bestAd, today: bestAd };
                bestReels = { lastMonth: bestReel, lastWeek: bestReel, thisWeek: bestReel, today: bestReel };
            } else {
                const broad = getBroadRange();
                const periods = getPeriodRanges();
                dateRange = { from: broad.from, to: broad.to };
                const insightsRows = await fetchInsightsForAI(broad.from, broad.to);
                bestAds = {
                    lastMonth: pickBestAd(insightsRows.filter((r) => rowOverlapsPeriod(r, periods.lastMonth))),
                    lastWeek: pickBestAd(insightsRows.filter((r) => rowOverlapsPeriod(r, periods.lastWeek))),
                    thisWeek: pickBestAd(insightsRows.filter((r) => rowOverlapsPeriod(r, periods.thisWeek))),
                    today: pickBestAd(insightsRows.filter((r) => rowOverlapsPeriod(r, periods.today)))
                };
                let mediaPayload = null;
                const pages = await fetchPages();
                const pageId = pages && pages[0] ? (pages[0].id || pages[0].page_id || '') : null;
                if (pageId) mediaPayload = await fetchMediaInsightsForAI(pageId);
                bestReels = {
                    lastMonth: pickBestReel(mediaPayload, periods.lastMonth) || pickBestReel(mediaPayload),
                    lastWeek: pickBestReel(mediaPayload, periods.lastWeek) || pickBestReel(mediaPayload),
                    thisWeek: pickBestReel(mediaPayload, periods.thisWeek) || pickBestReel(mediaPayload),
                    today: pickBestReel(mediaPayload, periods.today) || pickBestReel(mediaPayload)
                };
            }

            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch(`${API_BASE}/api/ai/insights`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    bestAds,
                    bestReels,
                    dateRange,
                    context: { platform: platformFilter, location: locationFilter, age: ageFilter }
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json.details || json.error || res.statusText || 'Failed to load AI insights');
                return;
            }
            if (json.success && json.data) {
                if (json.data.adsData) setAdsData(json.data.adsData);
                if (json.data.reelsData) setReelsData(json.data.reelsData);
                if (Array.isArray(json.data.insights)) setInsights(json.data.insights);
                if (Array.isArray(json.data.recommendations)) setRecommendations(json.data.recommendations);
            }
        } catch (err) {
            setError(err.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, [datePreset]);

    useEffect(() => {
        fetchAIInsights();
    }, [fetchAIInsights]);

    const filtersRef = useRef(null);
    useEffect(() => {
        const close = (e) => {
            if (filtersRef.current && !filtersRef.current.contains(e.target)) setDropdownOpen({ date: false, platform: false, location: false, age: false });
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const currentAd = adsData[activeTimeWindow] || defaultAdsData.lastWeek;
    const currentReel = reelsData[activeTimeWindow] || defaultReelsData.lastWeek;

    return (
        <div className={`ai-insights-container${loading ? ' ai-content-hidden' : ''}`}>
            {/* HEADER */}
            <div className="ai-header">
                <h1 className="ai-title">
                    <i className="fas fa-brain"></i>
                    AI Marketing Intelligence
                    <span className="ai-badge">BETA</span>
                </h1>
                <p className="ai-subtitle">
                    Real-time performance insights and data-driven recommendations for your ads and reels
                </p>
            </div>

            {loading && (
                <div className="ai-loading" aria-busy="true">
                    <div className="ai-loading-spinner"></div>
                    <p>Generating AI insights…</p>
                </div>
            )}

            {error && !loading && (
                <div className="ai-error">
                    <i className="fas fa-exclamation-triangle"></i>
                    <span>{error}</span>
                    <button type="button" className="ai-retry-btn" onClick={fetchAIInsights}>
                        Retry
                    </button>
                </div>
            )}

            {/* FILTER CONTROLS */}
            <div className="ai-filters" ref={filtersRef}>
                <div className="filter-dropdown-wrap">
                    <button
                        type="button"
                        className="filter-chip"
                        onClick={() => setDropdownOpen((o) => ({ ...o, date: !o.date, platform: false, location: false, age: false }))}
                        aria-expanded={dropdownOpen.date}
                    >
                        <i className="fas fa-calendar-alt"></i>
                        {DATE_PRESETS.find((p) => p.id === datePreset)?.label || 'Date range'}
                        <i className={`fas fa-chevron-down small ${dropdownOpen.date ? 'open' : ''}`}></i>
                    </button>
                    {dropdownOpen.date && (
                        <ul className="filter-dropdown-menu" role="listbox">
                            {DATE_PRESETS.map((p) => (
                                <li
                                    key={p.id}
                                    role="option"
                                    aria-selected={datePreset === p.id}
                                    className={datePreset === p.id ? 'selected' : ''}
                                    onClick={() => {
                                        setDatePreset(p.id);
                                        setDropdownOpen((o) => ({ ...o, date: false }));
                                    }}
                                >
                                    {p.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="filter-dropdown-wrap">
                    <button
                        type="button"
                        className="filter-chip"
                        onClick={() => setDropdownOpen((o) => ({ ...o, platform: !o.platform, date: false, location: false, age: false }))}
                        aria-expanded={dropdownOpen.platform}
                    >
                        <i className="fas fa-layer-group"></i>
                        {PLATFORM_OPTIONS.find((p) => p.id === platformFilter)?.label || 'Platform'}
                        <i className={`fas fa-chevron-down small ${dropdownOpen.platform ? 'open' : ''}`}></i>
                    </button>
                    {dropdownOpen.platform && (
                        <ul className="filter-dropdown-menu" role="listbox">
                            {PLATFORM_OPTIONS.map((p) => (
                                <li
                                    key={p.id}
                                    role="option"
                                    aria-selected={platformFilter === p.id}
                                    className={platformFilter === p.id ? 'selected' : ''}
                                    onClick={() => {
                                        setPlatformFilter(p.id);
                                        setDropdownOpen((o) => ({ ...o, platform: false }));
                                    }}
                                >
                                    {p.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="filter-dropdown-wrap">
                    <button
                        type="button"
                        className="filter-chip"
                        onClick={() => setDropdownOpen((o) => ({ ...o, location: !o.location, date: false, platform: false, age: false }))}
                        aria-expanded={dropdownOpen.location}
                    >
                        <i className="fas fa-map-marker-alt"></i>
                        {LOCATION_OPTIONS.find((p) => p.id === locationFilter)?.label || 'Location'}
                        <i className={`fas fa-chevron-down small ${dropdownOpen.location ? 'open' : ''}`}></i>
                    </button>
                    {dropdownOpen.location && (
                        <ul className="filter-dropdown-menu" role="listbox">
                            {LOCATION_OPTIONS.map((p) => (
                                <li
                                    key={p.id}
                                    role="option"
                                    aria-selected={locationFilter === p.id}
                                    className={locationFilter === p.id ? 'selected' : ''}
                                    onClick={() => {
                                        setLocationFilter(p.id);
                                        setDropdownOpen((o) => ({ ...o, location: false }));
                                    }}
                                >
                                    {p.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="filter-dropdown-wrap">
                    <button
                        type="button"
                        className="filter-chip"
                        onClick={() => setDropdownOpen((o) => ({ ...o, age: !o.age, date: false, platform: false, location: false }))}
                        aria-expanded={dropdownOpen.age}
                    >
                        <i className="fas fa-users"></i>
                        {AGE_OPTIONS.find((p) => p.id === ageFilter)?.label || 'Age'}
                        <i className={`fas fa-chevron-down small ${dropdownOpen.age ? 'open' : ''}`}></i>
                    </button>
                    {dropdownOpen.age && (
                        <ul className="filter-dropdown-menu" role="listbox">
                            {AGE_OPTIONS.map((p) => (
                                <li
                                    key={p.id}
                                    role="option"
                                    aria-selected={ageFilter === p.id}
                                    className={ageFilter === p.id ? 'selected' : ''}
                                    onClick={() => {
                                        setAgeFilter(p.id);
                                        setDropdownOpen((o) => ({ ...o, age: false }));
                                    }}
                                >
                                    {p.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="summary-cards-grid">
                {platformFilter !== 'reels' && (
                    <>
                        <div className="summary-card">
                            <div className="summary-card-header">Best Ad • Last Month</div>
                            <div className="summary-card-title">{adsData.lastMonth.name}</div>
                            <div className="summary-card-meta">{adsData.lastMonth.platform}</div>
                            <div className="summary-card-metric">
                                <span className="metric-label">CPL</span>
                                <span className="metric-value">${adsData.lastMonth.cpl}</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <span className="metric-badge badge-scale">{adsData.lastMonth.action}</span>
                            </div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-header">Best Ad • Last Week</div>
                            <div className="summary-card-title">{adsData.lastWeek.name}</div>
                            <div className="summary-card-meta">{adsData.lastWeek.platform}</div>
                            <div className="summary-card-metric">
                                <span className="metric-label">Leads</span>
                                <span className="metric-value">{adsData.lastWeek.leads}</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <span className="metric-badge badge-scale">{adsData.lastWeek.action}</span>
                            </div>
                        </div>
                        <div className="summary-card">
                            <div className="summary-card-header">Best Ad • This Week</div>
                            <div className="summary-card-title">{adsData.thisWeek.name}</div>
                            <div className="summary-card-meta">{adsData.thisWeek.platform}</div>
                            <div className="summary-card-metric">
                                <span className="metric-label">Leads</span>
                                <span className="metric-value">{adsData.thisWeek.leads}</span>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <span className="metric-badge badge-monitor">{adsData.thisWeek.action}</span>
                            </div>
                        </div>
                    </>
                )}
                {platformFilter !== 'ads' && (
                    <div className="summary-card">
                        <div className="summary-card-header">Best Reel • Most Reach</div>
                        <div className="summary-card-title">{reelsData.lastMonth.name}</div>
                        <div className="summary-card-meta">{reelsData.lastMonth.platform}</div>
                        <div className="summary-card-metric">
                            <span className="metric-label">Reach</span>
                            <span className="metric-value">{(reelsData.lastMonth.reach / 1000).toFixed(0)}K</span>
                        </div>
                        <div style={{ marginTop: '8px' }}>
                            <span className="metric-badge badge-boost">{reelsData.lastMonth.action}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* TIME WINDOW TABS */}
            <div className="time-tabs">
                <button
                    className={`time-tab ${activeTimeWindow === 'lastMonth' ? 'active' : ''}`}
                    onClick={() => setActiveTimeWindow('lastMonth')}
                >
                    Last Month
                </button>
                <button
                    className={`time-tab ${activeTimeWindow === 'lastWeek' ? 'active' : ''}`}
                    onClick={() => setActiveTimeWindow('lastWeek')}
                >
                    Last Week
                </button>
                <button
                    className={`time-tab ${activeTimeWindow === 'thisWeek' ? 'active' : ''}`}
                    onClick={() => setActiveTimeWindow('thisWeek')}
                >
                    This Week
                </button>
                <button
                    className={`time-tab ${activeTimeWindow === 'today' ? 'active' : ''}`}
                    onClick={() => setActiveTimeWindow('today')}
                >
                    Today
                </button>
            </div>

            {/* MAIN CONTENT GRID */}
            <div className="ai-content-grid">
                {platformFilter !== 'reels' && (
                    <div className="performance-panel fade-in" key={activeTimeWindow + '-ad'}>
                        <div className="panel-header">
                            <h3 className="panel-title">Best Performing Ad</h3>
                            <div className="panel-icon icon-ad">
                                <i className="fas fa-ad"></i>
                            </div>
                        </div>
                        <div className="performance-item">
                            <div className="perf-name">{currentAd.name}</div>
                            <div className="perf-meta">
                                <i className="fas fa-layer-group"></i> {currentAd.platform}
                                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span>
                                ${currentAd.spend} Spend
                                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span>
                                {currentAd.leads} Leads
                            </div>
                            <div className="perf-reason">{currentAd.reason}</div>
                            <span className={`perf-action action-${currentAd.action.toLowerCase()}`}>
                                <i className="fas fa-arrow-up"></i> AI Action: {currentAd.action}
                            </span>
                        </div>
                    </div>
                )}
                {platformFilter !== 'ads' && (
                    <div className="performance-panel fade-in" key={activeTimeWindow + '-reel'}>
                        <div className="panel-header">
                            <h3 className="panel-title">Best Performing Reel</h3>
                            <div className="panel-icon icon-reel">
                                <i className="fas fa-video"></i>
                            </div>
                        </div>
                        <div className="performance-item">
                            <div className="perf-name">{currentReel.name}</div>
                            <div className="perf-meta">
                                <i className="fab fa-instagram"></i> {currentReel.platform}
                                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span>
                                {(currentReel.reach / 1000).toFixed(0)}K Reach
                                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>•</span>
                                {currentReel.engagements} Engagements
                            </div>
                            <div className="perf-reason">{currentReel.reason}</div>
                            <span className={`perf-action action-${currentReel.action.toLowerCase()}`}>
                                <i className="fas fa-bolt"></i> AI Action: {currentReel.action}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* AI INSIGHTS FEED */}
            <div className="insights-feed">
                <div className="panel-header" style={{ marginBottom: '20px' }}>
                    <h3 className="panel-title">
                        <i className="fas fa-lightbulb" style={{ color: '#f59e0b', marginRight: '8px' }}></i>
                        AI Insights Feed
                    </h3>
                </div>
                {insights.map(insight => (
                    <div key={insight.id} className={`insight-card ${insight.category}`}>
                        <div className="insight-header">
                            <span className="insight-type">{insight.type}</span>
                            <span className="insight-time">{insight.timeWindow}</span>
                        </div>
                        <div className="insight-text">{insight.text}</div>
                        <div className="insight-action">
                            <i className="fas fa-arrow-right"></i>
                            {insight.action}
                        </div>
                    </div>
                ))}
            </div>

            {/* RECOMMENDATION PANEL */}
            <div className="recommendation-panel">
                <h2 className="rec-title">
                    <i className="fas fa-robot"></i>
                    AI Recommendation Engine
                </h2>
                <p className="rec-subtitle">
                    Data-driven actions to optimize your marketing performance
                </p>
                <div className="rec-actions-grid">
                    {recommendations.map(rec => (
                        <div key={rec.id} className="rec-action-card">
                            <div className="rec-action-header">
                                <div className={`rec-icon ${rec.color}`}>
                                    <span>{rec.icon}</span>
                                </div>
                                <div className="rec-action-title">{rec.title}</div>
                            </div>
                            <div className="rec-justification">{rec.justification}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
