import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './AIInsights.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';
/** Ask AI uses Gemini; allow extra time for cold hosts and slow API responses */
const ASK_AI_FETCH_TIMEOUT_MS = 120000;

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

/** Calendar Y-M-D in local timezone (avoids UTC day shift vs Leads.DateChar). */
const toYMDLocal = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Period ranges for Last Month, Last Week, This Week, Today (for tabs) — local calendar dates (matches hero presets / Leads). */
const getPeriodRanges = () => {
    const today = new Date();
    const lastMonth = { from: '', to: '' };
    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    lastMonth.from = toYMDLocal(lastMonthStart);
    lastMonth.to = toYMDLocal(lastMonthEnd);

    const lastWeek = { from: '', to: '' };
    const lastWeekEnd = new Date(today);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    lastWeek.from = toYMDLocal(lastWeekStart);
    lastWeek.to = toYMDLocal(lastWeekEnd);

    const thisWeek = { from: '', to: '' };
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    thisWeek.from = toYMDLocal(thisWeekStart);
    thisWeek.to = toYMDLocal(today);

    const todayRange = { from: toYMDLocal(today), to: toYMDLocal(today) };

    return { lastMonth, lastWeek, thisWeek, today: todayRange };
};

const rowYMD = (r) => {
    const s = r?.date_start || r?.date_stop || r?.date;
    if (!s) return null;
    return String(s).slice(0, 10);
};

/** Keep Meta insight rows whose row day falls inside the tab period (time_increment=1 rows). */
const filterInsightsRowsByPeriod = (rows, period) => {
    if (!rows?.length || !period?.from || !period?.to) return [];
    return rows.filter((r) => {
        const ymd = rowYMD(r);
        if (!ymd) return false;
        return ymd >= period.from && ymd <= period.to;
    });
};

/** Preset ids for the hero date control (aligned with getDateRangeForPreset). */
const INSIGHTS_DATE_PRESET_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom' },
];

const getDateRangeForPreset = (presetId) => {
    const today = new Date();
    if (presetId === 'today') {
        return { from: toYMDLocal(today), to: toYMDLocal(today) };
    }
    if (presetId === 'last_7_days') {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { from: toYMDLocal(start), to: toYMDLocal(today) };
    }
    if (presetId === 'last_14_days') {
        const start = new Date(today);
        start.setDate(start.getDate() - 13);
        return { from: toYMDLocal(start), to: toYMDLocal(today) };
    }
    if (presetId === 'last_30_days') {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { from: toYMDLocal(start), to: toYMDLocal(today) };
    }
    if (presetId === 'this_week') {
        const start = new Date(today);
        start.setDate(start.getDate() - start.getDay());
        return { from: toYMDLocal(start), to: toYMDLocal(today) };
    }
    if (presetId === 'last_week') {
        const end = new Date(today);
        end.setDate(end.getDate() - end.getDay() - 1);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        return { from: toYMDLocal(start), to: toYMDLocal(end) };
    }
    if (presetId === 'this_month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toYMDLocal(start), to: toYMDLocal(today) };
    }
    if (presetId === 'last_month') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { from: toYMDLocal(start), to: toYMDLocal(end) };
    }
    return null;
};

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
const fmtMoney = (v) => `₹${(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Meta ad account id for tables (always act_ prefix). */
const fmtAdAccountId = (id) => {
    if (id == null || id === '') return '—';
    const raw = String(id).trim();
    if (!raw) return '—';
    const num = raw.replace(/^act_/i, '');
    return `act_${num}`;
};

/** MHS lead-intaligetionn-state.md timing by tier */
const mhsLeadTierActionTiming = (tier) => {
    const t = String(tier || '');
    if (t === 'Hot') return 'Within 2 hrs — personal call';
    if (t === 'Warm') return '24 hrs — WhatsApp sequence';
    if (t === 'Nurture') return '48 hrs — follow-up sequence';
    return 'Weekly — broadcast only';
};

const inferLeadTierFromRow = (r) => {
    if (r.tier) return r.tier;
    const c = String(r.category || '');
    if (c.includes('Hot')) return 'Hot';
    if (c.includes('Warm')) return 'Warm';
    if (c.includes('Nurture')) return 'Nurture';
    return 'Cold';
};
const fmtInt = (v) => (Number(v) || 0).toLocaleString('en-IN');
const fmtReach = (v) => { const n = Number(v) || 0; return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n); };

const mapAdPickToSlot = (best) => {
    if (!best) {
        return {
            name: '—',
            platform: 'Meta',
            spend: 0,
            leads: 0,
            cpl: 0,
            reason: 'No ad data for this calendar period in the loaded analysis range.',
            action: 'MONITOR',
            dateStart: '',
            dateStop: ''
        };
    }
    return {
        name: best.name,
        platform: best.platform || 'Meta',
        spend: best.spend,
        leads: best.leads,
        cpl: best.cpl,
        reason: `Best in this period: ${best.leads} leads, ${fmtMoney(best.spend)} spend, ${fmtMoney(best.cpl)} CPL.`,
        action: 'MONITOR',
        dateStart: best.dateStart || '',
        dateStop: best.dateStop || ''
    };
};

const mapReelPickToSlot = (best) => {
    if (!best) {
        return {
            name: '—',
            platform: 'Instagram',
            reach: 0,
            engagements: 0,
            saves: 0,
            views: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            reason: 'No reel in this calendar period within the loaded analysis range.',
            action: 'MONITOR',
            timestamp: '',
            thumbnail_url: '',
            permalink: ''
        };
    }
    const rch = best.reach || best.views || 0;
    return {
        name: best.name,
        platform: best.platform || 'Instagram',
        reach: best.reach,
        engagements: best.engagements,
        saves: best.saves,
        views: best.views,
        likes: best.likes,
        comments: best.comments,
        shares: best.shares,
        reason: `Top in this period: ${fmtReach(rch)} reach, ${fmtInt(best.engagements)} engagements, ${best.saves} saves.`,
        action: 'MONITOR',
        timestamp: best.timestamp || '',
        thumbnail_url: best.thumbnail_url || '',
        permalink: best.permalink || ''
    };
};

const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
};
const fmtDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
            ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return dateStr; }
};

const formatDateHeaderShort = (ymd) => {
    if (!ymd) return '';
    try {
        const d = new Date(`${ymd}T12:00:00`);
        if (isNaN(d.getTime())) return ymd;
        return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return ymd;
    }
};

const parseInsightsRows = (rawData) => {
    let data = rawData;
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
};

const fetchInsightsForAI = async (from, to, forceRefresh = false) => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // On initial load, read from DB (no live=1) to avoid heavy Meta API calls
        // across many accounts that can timeout and return 500.
        // On explicit refresh, use live=1 to fetch fresh data from Meta.
        const liveParam = forceRefresh ? '&live=1&refresh=1' : '';
        const baseUrl = `${API_BASE}/api/meta/insights?time_increment=1&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&is_all_campaigns=1&is_all_ads=1`;
        const res = await fetch(`${baseUrl}${liveParam}`, { headers });
        if (!res.ok) {
            // DB fetch failed; try once with live as fallback
            if (!forceRefresh) {
                try {
                    const liveRes = await fetch(`${baseUrl}&live=1`, { headers });
                    if (liveRes.ok) return parseInsightsRows(await liveRes.json());
                } catch (_) { /* fall through */ }
            }
            return [];
        }
        const rows = parseInsightsRows(await res.json());

        // If DB returned no rows and this wasn't already a live request, retry with live
        if (rows.length === 0 && !forceRefresh) {
            try {
                const liveRes = await fetch(`${baseUrl}&live=1`, { headers });
                if (liveRes.ok) return parseInsightsRows(await liveRes.json());
            } catch (_) { /* fall through */ }
        }
        return rows;
    } catch (e) {
        console.error('fetchInsightsForAI error:', e);
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

const fetchJsonWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
};

const fetchMediaInsightsForAI = async (pageId, opts = {}) => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const params = new URLSearchParams();
        params.append('pageIds', pageId);
        params.append('contentType', 'reels');
        if (opts.from) params.append('from', opts.from);
        if (opts.to) params.append('to', opts.to);
        if (opts.forceRefresh) params.append('refresh', '1');
        const res = await fetchJsonWithTimeout(`${API_BASE}/api/meta/instagram/media-insights?${params.toString()}`, { headers }, opts.timeoutMs || 30000);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
};

const fetchMediaInsightsForPages = async (pages = [], opts = {}) => {
    const pageIds = pages
        .map((p) => p?.id || p?.page_id || '')
        .filter(Boolean);

    if (pageIds.length === 0) return null;

    const results = await Promise.allSettled(
        pageIds.map((pageId) => fetchMediaInsightsForAI(pageId, opts))
    );

    const mediaMap = new Map();
    results.forEach((result) => {
        if (result.status !== 'fulfilled' || !result.value?.media) return;
        result.value.media.forEach((item) => {
            const key = item.id || item.media_id || item.permalink || `${item.timestamp || ''}-${item.caption || ''}`;
            if (!key) return;
            if (!mediaMap.has(key)) mediaMap.set(key, item);
        });
    });

    return { media: [...mediaMap.values()] };
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
                ad_account_name: r.ad_account_name || '',
                dateStart: r.date_start || '',
                dateStop: r.date_stop || ''
            };
        }
        adMap[key].spend += r.spend || 0;
        adMap[key].leads += r.leads || 0;
        if (r.date_start && (!adMap[key].dateStart || r.date_start < adMap[key].dateStart)) adMap[key].dateStart = r.date_start;
        if (r.date_stop && (!adMap[key].dateStop || r.date_stop > adMap[key].dateStop)) adMap[key].dateStop = r.date_stop;
    });
    const aggregated = Object.values(adMap).map((d) => ({
        ...d,
        spend: Math.round(d.spend * 100) / 100,
        cpl: d.leads > 0 ? Math.round((d.spend / d.leads) * 100) / 100 : 0
    }));
    aggregated.sort((a, b) => {
        const leadDiff = (b.leads || 0) - (a.leads || 0);
        if (leadDiff !== 0) return leadDiff;
        const cplDiff = (a.cpl || 0) - (b.cpl || 0);
        if (cplDiff !== 0) return cplDiff;
        return (b.spend || 0) - (a.spend || 0);
    });
    const best = aggregated[0];
    return best ? { name: best.name, campaignName: best.campaignName, platform: best.platform, spend: best.spend, leads: best.leads, cpl: best.cpl, ad_account_name: best.ad_account_name || undefined, dateStart: best.dateStart, dateStop: best.dateStop } : null;
};

const buildReelResult = (top) => {
    const reach = Number(top.reach) || Number(top.views) || 0;
    const engagements = Number(top.total_interactions) || (Number(top.likes) + Number(top.comments)) || 0;
    const saves = Number(top.saved) || 0;
    const name = (top.caption && top.caption.slice(0, 80)) || 'Reel';
    return { name, platform: 'Instagram', reach, engagements, saves, caption: top.caption, permalink: top.permalink, timestamp: top.timestamp || '', thumbnail_url: top.thumbnail_url || top.media_url || '', likes: Number(top.likes) || 0, comments: Number(top.comments) || 0, shares: Number(top.shares) || 0, views: Number(top.views) || Number(top.video_views) || 0 };
};

const filterReels = (mediaPayload, period = null) => {
    const media = mediaPayload?.media || [];
    let reels = media.filter((m) => (m.product_type === 'REELS' || (m.media_type === 'VIDEO' && (m.permalink || '').includes('/reel/'))) && (m.availability === 'available' || (m.views || m.reach) > 0));
    if (period && period.from && period.to) {
        reels = reels.filter((m) => {
            const ts = m.timestamp;
            if (!ts) return false;
            const ymd = toYMDLocal(new Date(ts));
            return ymd >= period.from && ymd <= period.to;
        });
    }
    return reels;
};

/** Sanitize watch time — Meta sometimes returns impossibly high values */
const capWatchTime = (raw) => Math.min(Number(raw) || 0, 120);

/** Performance Score = weighted sum of reel metrics (sanitized inputs) */
const computeReelScore = (reel) => {
    const views = Number(reel.views || reel.video_views || 0);
    const reach = Number(reel.reach || 0);
    const likes = Number(reel.likes || 0);
    const comments = Number(reel.comments || 0);
    const shares = Number(reel.shares || 0);
    const saves = Number(reel.saved || reel.saves || 0);
    const watchTime = capWatchTime(reel.video_avg_time_watched);
    const hookRate = Math.min(Number(reel.hook_rate || 0), 100);
    const engagementRate = reach > 0 ? ((likes + comments + shares + saves) / reach) * 100 : 0;
    return (views * 0.20) + (reach * 0.20) + (engagementRate * 0.15) + (shares * 0.15)
         + (saves * 0.10) + (comments * 0.10) + (watchTime * 0.05) + (hookRate * 0.05);
};

const pickBestReel = (mediaPayload, period = null) => {
    const reels = filterReels(mediaPayload, period);
    if (reels.length === 0) return null;
    const sorted = [...reels].sort((a, b) => computeReelScore(b) - computeReelScore(a));
    const best = sorted[0];
    const result = buildReelResult(best);
    result.score = Math.round(computeReelScore(best));
    return result;
};

/** Full reel intelligence analysis: normalized scoring, flags, time-based categorization */
const analyzeReelPerformance = (mediaPayload, periods) => {
    const media = mediaPayload?.media || [];
    const allReels = media.filter((m) =>
        (m.product_type === 'REELS' || (m.media_type === 'VIDEO' && (m.permalink || '').includes('/reel/')))
        && (m.availability === 'available' || (m.views || m.reach) > 0)
    );
    const empty = { daily_best_reel: null, this_week_best_reel: null, last_week_best_reel: null, weekly_best_reel: null, monthly_best_reel: null, all_time_best_reel: null, trending_reels: [], repost_recommended: [], rising_reels: [], stable_top_performers: [], top_reels: [] };
    if (allReels.length === 0) return empty;

    const rawData = allReels.map((reel) => {
        const views = Number(reel.views || reel.video_views || 0);
        const reach = Number(reel.reach || 0);
        const likes = Number(reel.likes || 0);
        const comments = Number(reel.comments || 0);
        const shares = Number(reel.shares || 0);
        const saves = Number(reel.saved || 0);
        const hookRate = Math.min(Number(reel.hook_rate || 0), 100);
        const watchTime = capWatchTime(reel.video_avg_time_watched);
        const follows = Number(reel.follows || 0);
        const total = likes + comments + shares + saves;
        const engagementRate = reach > 0 ? Math.round((total / reach) * 10000) / 100 : 0;
        const ageMs = reel.timestamp ? Date.now() - new Date(reel.timestamp).getTime() : 0;
        const ageDays = ageMs > 0 ? ageMs / 86400000 : 0;
        const viewVelocity = ageDays > 0 ? Math.round(views / ageDays) : views;
        const shareVelocity = ageDays > 0 ? Math.round((shares / ageDays) * 10) / 10 : shares;
        return { reel, views, reach, engagementRate, shares, saves, comments, hookRate, watchTime, follows, ageDays, viewVelocity, shareVelocity };
    });

    const minMax = (arr, fn) => {
        const vals = arr.map(fn);
        const mn = Math.min(...vals);
        const mx = Math.max(...vals);
        const range = mx - mn;
        return (v) => range > 0 ? ((v - mn) / range) * 100 : 0;
    };
    const normViews = minMax(rawData, r => r.views);
    const normReach = minMax(rawData, r => r.reach);
    const normEng = minMax(rawData, r => r.engagementRate);
    const normShares = minMax(rawData, r => r.shares);
    const normSaves = minMax(rawData, r => r.saves);
    const normComments = minMax(rawData, r => r.comments);
    const normWatch = minMax(rawData, r => r.watchTime);
    const normHook = minMax(rawData, r => r.hookRate);

    const scored = rawData.map((d) => {
        const normalizedScore = (normViews(d.views) * 0.20) + (normReach(d.reach) * 0.20)
            + (normEng(d.engagementRate) * 0.15) + (normShares(d.shares) * 0.15)
            + (normSaves(d.saves) * 0.10) + (normComments(d.comments) * 0.10)
            + (normWatch(d.watchTime) * 0.05) + (normHook(d.hookRate) * 0.05);
        return {
            ...buildReelResult(d.reel),
            score: Math.round(normalizedScore), engagementRate: d.engagementRate,
            hookRate: d.hookRate, watchTime: d.watchTime, follows: d.follows,
            ageDays: Math.round(d.ageDays * 10) / 10, viewVelocity: d.viewVelocity,
            shareVelocity: d.shareVelocity, flags: [], reason: '',
        };
    }).sort((a, b) => b.score - a.score);

    const avg = (arr, fn) => arr.length > 0 ? arr.reduce((s, r) => s + fn(r), 0) / arr.length : 0;
    const avgScore = avg(scored, r => r.score);
    const avgEng = avg(scored, r => r.engagementRate);
    const avgVV = avg(scored, r => r.viewVelocity);
    const avgShares = avg(scored, r => r.shares || 0);
    const avgSaves = avg(scored, r => r.saves || 0);
    const p25Idx = Math.max(0, Math.floor(scored.length * 0.25) - 1);
    const topQuartileScore = scored[p25Idx]?.score || avgScore;

    scored.forEach((reel) => {
        const flags = [];
        const reasons = [];
        if (reel.viewVelocity > avgVV * 2 && reel.engagementRate > avgEng * 1.5) {
            flags.push('TRENDING');
            reasons.push('rapid view growth and high engagement spike');
        }
        if ((reel.shares || 0) > avgShares * 1.5 && (reel.saves || 0) > avgSaves * 1.5 && reel.engagementRate > avgEng) {
            flags.push('REPOST_RECOMMENDED');
            reasons.push('high shares, saves, and engagement — strong repost candidate');
        }
        if (reel.ageDays <= 1 && reel.score > avgScore) {
            flags.push('RISING');
            reasons.push('strong early performance within first 24 hours');
        }
        if (reel.ageDays >= 3 && reel.score >= topQuartileScore) {
            flags.push('STABLE_TOP_PERFORMER');
            reasons.push('consistently high performance over 3+ days');
        }
        reel.flags = flags;
        const highlights = [];
        if (reel.views > 0) highlights.push(`${fmtReach(reel.views)} views`);
        if (reel.engagementRate > avgEng) highlights.push(`${reel.engagementRate.toFixed(1)}% engagement`);
        if ((reel.shares || 0) > avgShares) highlights.push(`${reel.shares} shares`);
        if (reel.watchTime > 0) highlights.push(`${reel.watchTime.toFixed(1)}s avg watch`);
        if (reel.hookRate > 0) highlights.push(`${reel.hookRate}% hook rate`);
        const base = reasons.length > 0 ? reasons.join('; ') + '.' : '';
        const metrics = highlights.length > 0 ? ` Key metrics: ${highlights.join(', ')}.` : '';
        reel.reason = (base + metrics).trim() || `Performance score: ${reel.score}`;
    });

    const inPeriod = (reels, period) => {
        if (!period?.from || !period?.to) return [];
        return reels.filter((r) => {
            if (!r.timestamp) return false;
            const ymd = toYMDLocal(new Date(r.timestamp));
            return ymd >= period.from && ymd <= period.to;
        });
    };
    /** Best-scoring reel in period (not first row in global sort). */
    const bestIn = (period) => {
        const f = inPeriod(scored, period);
        if (f.length === 0) return null;
        return [...f].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    };

    return {
        daily_best_reel: bestIn(periods.today),
        this_week_best_reel: bestIn(periods.thisWeek),
        last_week_best_reel: bestIn(periods.lastWeek),
        weekly_best_reel: bestIn(periods.thisWeek) || bestIn(periods.lastWeek),
        monthly_best_reel: bestIn(periods.lastMonth),
        all_time_best_reel: scored[0] || null,
        trending_reels: scored.filter((r) => r.flags.includes('TRENDING')).slice(0, 5),
        repost_recommended: scored.filter((r) => r.flags.includes('REPOST_RECOMMENDED')).slice(0, 5),
        rising_reels: scored.filter((r) => r.flags.includes('RISING')).slice(0, 5),
        stable_top_performers: scored.filter((r) => r.flags.includes('STABLE_TOP_PERFORMER')).slice(0, 5),
        top_reels: scored.filter((r) => r.score >= topQuartileScore).slice(0, 10),
    };
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

    const [loading, setLoading] = useState(true);
    /** 'data' = fetching Meta ads/reels, 'ai' = calling Gemini */
    const [loadingPhase, setLoadingPhase] = useState('data');
    const [error, setError] = useState(null);
    const [adsData, setAdsData] = useState(defaultAdsData);
    const [reelsData, setReelsData] = useState(defaultReelsData);
    const [insights, setInsights] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    /** When AI returns 429 quota exceeded: show last result + this message and countdown */
    const [quotaRetrySeconds, setQuotaRetrySeconds] = useState(null);
    const [lastAnalysedAt, setLastAnalysedAt] = useState(null);
    const [askInput, setAskInput] = useState('');
    const [askHint, setAskHint] = useState('');
    const [askLoading, setAskLoading] = useState(false);
    const [askAnswer, setAskAnswer] = useState('');
    const [askError, setAskError] = useState('');

    /* Lead Saturation Detection – isolated state, does not affect Intelligence block */
    const [saturationLoading, setSaturationLoading] = useState(false);
    const [saturationError, setSaturationError] = useState(null);
    const [saturationResult, setSaturationResult] = useState(null);
    const [fatigueLoading, setFatigueLoading] = useState(false);
    const [fatigueError, setFatigueError] = useState(null);
    const [fatigueResult, setFatigueResult] = useState(null);
    const [qualityLoading, setQualityLoading] = useState(false);
    const [qualityError, setQualityError] = useState(null);
    const [qualityResult, setQualityResult] = useState(null);
    const [qualityScores, setQualityScores] = useState([]);
    const [reelAnalysis, setReelAnalysis] = useState(null);

    const [insightsDatePreset, setInsightsDatePreset] = useState('this_month');
    const [customDraftFrom, setCustomDraftFrom] = useState('');
    const [customDraftTo, setCustomDraftTo] = useState('');
    /** Applied custom range only updates after “Apply range” (avoids refetch on every date input change). */
    const [customCommitted, setCustomCommitted] = useState({ from: '', to: '' });
    const [datePresetMenuOpen, setDatePresetMenuOpen] = useState(false);
    const datePresetWrapRef = useRef(null);

    const resolvedInsightsRange = useMemo(() => {
        if (insightsDatePreset === 'custom') {
            if (customCommitted.from && customCommitted.to && customCommitted.from <= customCommitted.to) {
                return { from: customCommitted.from, to: customCommitted.to };
            }
            return getDateRangeForPreset('this_month');
        }
        return getDateRangeForPreset(insightsDatePreset) || getDateRangeForPreset('this_month');
    }, [insightsDatePreset, customCommitted.from, customCommitted.to]);

    const insightsPresetLabel = useMemo(() => {
        const o = INSIGHTS_DATE_PRESET_OPTIONS.find((x) => x.id === insightsDatePreset);
        return o?.label || 'This Month';
    }, [insightsDatePreset]);

    const headerDateRangeLabel = useMemo(() => {
        const r = resolvedInsightsRange;
        if (!r?.from || !r?.to) return '—';
        return `${formatDateHeaderShort(r.from)} – ${formatDateHeaderShort(r.to)}`;
    }, [resolvedInsightsRange]);

    useEffect(() => {
        if (!datePresetMenuOpen) return;
        const onDoc = (e) => {
            if (datePresetWrapRef.current && !datePresetWrapRef.current.contains(e.target)) {
                setDatePresetMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [datePresetMenuOpen]);

    const fetchAIInsights = useCallback(async (forceRefresh = false) => {
        setLoading(true);
        setLoadingPhase('data');
        setError(null);
        setQuotaRetrySeconds(null);
        try {
            const { from, to } = resolvedInsightsRange;
            const dateRange = { from, to };
            const [insightsRows, pages] = await Promise.all([fetchInsightsForAI(from, to, forceRefresh), fetchPages()]);
            const mediaPayload = await fetchMediaInsightsForPages(pages, { from, to, forceRefresh, timeoutMs: 20000 });
            const allPeriods = getPeriodRanges();
            setReelAnalysis(analyzeReelPerformance(mediaPayload, allPeriods));

            const bestAds = {
                lastMonth: pickBestAd(filterInsightsRowsByPeriod(insightsRows, allPeriods.lastMonth)),
                lastWeek: pickBestAd(filterInsightsRowsByPeriod(insightsRows, allPeriods.lastWeek)),
                thisWeek: pickBestAd(filterInsightsRowsByPeriod(insightsRows, allPeriods.thisWeek)),
                today: pickBestAd(filterInsightsRowsByPeriod(insightsRows, allPeriods.today))
            };
            const bestReels = {
                lastMonth: pickBestReel(mediaPayload, allPeriods.lastMonth),
                lastWeek: pickBestReel(mediaPayload, allPeriods.lastWeek),
                thisWeek: pickBestReel(mediaPayload, allPeriods.thisWeek),
                today: pickBestReel(mediaPayload, allPeriods.today)
            };

            // Show live ad/reel results immediately even if the AI summary step is slow.
            setAdsData({
                lastMonth: mapAdPickToSlot(bestAds.lastMonth),
                lastWeek: mapAdPickToSlot(bestAds.lastWeek),
                thisWeek: mapAdPickToSlot(bestAds.thisWeek),
                today: mapAdPickToSlot(bestAds.today)
            });
            setReelsData({
                lastMonth: mapReelPickToSlot(bestReels.lastMonth),
                lastWeek: mapReelPickToSlot(bestReels.lastWeek),
                thisWeek: mapReelPickToSlot(bestReels.thisWeek),
                today: mapReelPickToSlot(bestReels.today)
            });

            setLoadingPhase('ai');
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetchJsonWithTimeout(`${API_BASE}/api/ai/insights`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    bestAds,
                    bestReels,
                    dateRange,
                    context: { platform: 'all', location: 'all', age: 'all' }
                })
            }, 20000);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (res.status === 429) {
                    setError('AI quota exceeded. Showing last analysis below.');
                    setQuotaRetrySeconds(typeof json.retryAfterSeconds === 'number' ? json.retryAfterSeconds : 60);
                } else {
                    setError(json.details || json.error || res.statusText || 'Failed to load AI insights');
                }
                return;
            }
            if (json.success && json.data) {
                if (json.data.adsData) setAdsData(json.data.adsData);
                if (json.data.reelsData) setReelsData(json.data.reelsData);
                if (Array.isArray(json.data.insights)) setInsights(json.data.insights);
                if (Array.isArray(json.data.recommendations)) setRecommendations(json.data.recommendations);
            }
        } catch (err) {
            if (err?.name === 'AbortError') {
                setError('AI insights timed out. Showing live ad and reel data only.');
            } else {
                setError(err.message || 'Network error');
            }
        } finally {
            setLastAnalysedAt(new Date());
            setLoading(false);
        }
    }, [resolvedInsightsRange]);

    /* Countdown for quota retry: decrement every second, clear when 0 */
    useEffect(() => {
        if (quotaRetrySeconds == null || quotaRetrySeconds <= 0) return;
        const t = setInterval(() => {
            setQuotaRetrySeconds((s) => (s <= 1 ? null : s - 1));
        }, 1000);
        return () => clearInterval(t);
    }, [quotaRetrySeconds]);

    const fetchLeadSaturation = useCallback(async () => {
        setSaturationLoading(true);
        setSaturationError(null);
        setSaturationResult(null);
        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const dateRange = { from: resolvedInsightsRange.from, to: resolvedInsightsRange.to };
            const res = await fetch(`${API_BASE}/api/ai/lead-saturation`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ dateRange })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSaturationError(json.details || json.error || res.statusText || 'Lead saturation analysis failed');
                return;
            }
            setSaturationResult(json);
        } catch (err) {
            setSaturationError(err.message || 'Network error');
        } finally {
            setSaturationLoading(false);
        }
    }, [resolvedInsightsRange]);

    const fetchCreativeFatigue = useCallback(async () => {
        setFatigueLoading(true);
        setFatigueError(null);
        setFatigueResult(null);
        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const dateRange = { from: resolvedInsightsRange.from, to: resolvedInsightsRange.to };
            const res = await fetch(`${API_BASE}/api/ai/creative-fatigue`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ dateRange })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setFatigueError(json.details || json.error || res.statusText || 'Creative fatigue analysis failed');
                return;
            }
            setFatigueResult(json);
        } catch (err) {
            setFatigueError(err.message || 'Network error');
        } finally {
            setFatigueLoading(false);
        }
    }, [resolvedInsightsRange]);

    const loadLeadScores = useCallback(async () => {
        try {
            const token = getAuthToken();
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const { from, to } = resolvedInsightsRange;
            const res = await fetch(`${API_BASE}/api/ai/lead-quality/scores?dateFrom=${encodeURIComponent(from)}&dateTo=${encodeURIComponent(to)}&limit=100`, { headers });
            const json = await res.json().catch(() => ({}));
            if (json.success && Array.isArray(json.data)) setQualityScores(json.data);
        } catch (e) { /* ignore */ }
    }, [resolvedInsightsRange]);

    const fetchLeadQuality = useCallback(async () => {
        setQualityLoading(true);
        setQualityError(null);
        setQualityResult(null);
        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const { from, to } = resolvedInsightsRange;
            const res = await fetch(`${API_BASE}/api/ai/lead-quality`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ dateFrom: from, dateTo: to })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setQualityError(json.details || json.error || res.statusText || 'Lead quality scoring failed');
                return;
            }
            setQualityResult(json);
            if (json.success && json.samples?.length) setQualityScores(json.samples);
            if (json.success) await loadLeadScores();
        } catch (err) {
            setQualityError(err.message || 'Network error');
        } finally {
            setQualityLoading(false);
        }
    }, [resolvedInsightsRange, loadLeadScores]);

    useEffect(() => {
        fetchAIInsights();
    }, [fetchAIInsights]);

    useEffect(() => {
        loadLeadScores();
    }, [loadLeadScores]);

    useEffect(() => {
        fetchLeadSaturation();
        fetchCreativeFatigue();
    }, [fetchLeadSaturation, fetchCreativeFatigue]);

    const currentAd = adsData[activeTimeWindow] || defaultAdsData.lastWeek;
    const rawReel = reelsData[activeTimeWindow];
    const periodReel = rawReel && (rawReel.name !== '—' || rawReel.reach > 0 || rawReel.views > 0) ? rawReel : null;
    const periodLabels = { lastMonth: 'Last Month', lastWeek: 'Last Week', thisWeek: 'This Week', today: 'Today' };

    const analysisReelForPeriod = useMemo(() => {
        if (!reelAnalysis) return null;
        const map = { lastMonth: 'monthly_best_reel', lastWeek: 'last_week_best_reel', thisWeek: 'this_week_best_reel', today: 'daily_best_reel' };
        return reelAnalysis[map[activeTimeWindow]] || null;
    }, [reelAnalysis, activeTimeWindow]);

    const hasUsablePeriodReel = !!(periodReel && (
        Number(periodReel.reach || 0) > 0 ||
        Number(periodReel.views || 0) > 0 ||
        Number(periodReel.likes || 0) > 0 ||
        Number(periodReel.comments || 0) > 0 ||
        Number(periodReel.shares || 0) > 0 ||
        Number(periodReel.saves || periodReel.saved || 0) > 0 ||
        periodReel.thumbnail_url ||
        periodReel.permalink ||
        periodReel.timestamp
    ));
    /* Do not substitute "latest reel" from another day — it made e.g. Today show a January post. */
    const resolvedCurrentReel = hasUsablePeriodReel ? periodReel : null;
    const hasUsableAnalysisReel = !!(analysisReelForPeriod && (
        Number(analysisReelForPeriod.reach || 0) > 0 ||
        Number(analysisReelForPeriod.views || 0) > 0 ||
        analysisReelForPeriod.thumbnail_url ||
        analysisReelForPeriod.permalink ||
        analysisReelForPeriod.timestamp
    ));
    const displayReel = hasUsableAnalysisReel ? analysisReelForPeriod : resolvedCurrentReel;
    const displayReelFlags = displayReel?.flags || [];
    const flagLabels = { TRENDING: 'Trending Reel', REPOST_RECOMMENDED: 'Repost Recommended', RISING: 'Rising Reel', STABLE_TOP_PERFORMER: 'Stable Top Performer' };
    const flagColors = { TRENDING: '#ef4444', REPOST_RECOMMENDED: '#8b5cf6', RISING: '#f59e0b', STABLE_TOP_PERFORMER: '#22c55e' };
    const flagIcons = { TRENDING: 'fa-fire', REPOST_RECOMMENDED: 'fa-retweet', RISING: 'fa-arrow-trend-up', STABLE_TOP_PERFORMER: 'fa-shield-check' };
    const periodLabel = periodLabels[activeTimeWindow] || '';

    const saturationIndexPct = useMemo(() => {
        const avgFromSummary = saturationResult?.summary?.saturation_index_avg;
        if (avgFromSummary != null && !Number.isNaN(Number(avgFromSummary))) {
            return Math.min(100, Math.round(Number(avgFromSummary)));
        }
        const camps = saturationResult?.campaigns;
        if (!camps?.length) return null;
        const idxs = camps.map((c) => (c.saturation_index != null ? c.saturation_index : c.score) || 0);
        const avg = idxs.reduce((a, b) => a + b, 0) / idxs.length;
        return Math.min(100, Math.round(avg));
    }, [saturationResult]);

    const saturationStatusUi = useMemo(() => {
        const lvl = saturationResult?.saturationLevel;
        if (lvl === 'high') return { label: 'Critical', tone: 'crit' };
        if (lvl === 'medium') return { label: 'Warning', tone: 'mod' };
        return { label: 'Safe', tone: 'ok' };
    }, [saturationResult]);

    const saturationBars = useMemo(() => {
        const camps = saturationResult?.campaigns;
        if (!camps?.length) return [];
        const worst = [...camps].sort(
            (a, b) => (b.saturation_index ?? b.score ?? 0) - (a.saturation_index ?? a.score ?? 0)
        )[0];
        const freq = worst.frequency ?? 0;
        const rp = worst.reach_pct;
        const cpmWow = worst.cpm_wow_pct;
        const ctrDrop = worst.ctr_drop_pct;
        const fti = worst.first_time_impression_pct;
        const barTone = (danger, warn) => {
            if (danger) return 'danger';
            if (warn) return 'warn';
            return 'neutral';
        };
        return [
            {
                label: 'Frequency',
                value: typeof freq === 'number' ? `${freq.toFixed(1)}×` : '—',
                pct: Math.min(100, (freq / 5) * 100),
                tone: barTone(freq >= 4, freq > 3)
            },
            {
                label: 'Reach % of pool',
                value: rp != null ? `${Number(rp).toFixed(0)}%` : '—',
                pct: rp != null ? Math.min(100, rp) : 0,
                tone: barTone(rp >= 70, rp > 50)
            },
            {
                label: 'First-time impression share',
                value: fti != null ? `${Number(fti).toFixed(0)}%` : '—',
                pct: fti != null ? Math.min(100, fti) : 0,
                tone: barTone(fti != null && fti < 15, fti != null && fti < 30)
            },
            {
                label: 'CPM vs prior week',
                value: cpmWow != null ? `${cpmWow > 0 ? '+' : ''}${Number(cpmWow).toFixed(0)}%` : '—',
                pct: cpmWow != null ? Math.min(100, Math.abs(cpmWow)) : 0,
                tone: barTone(cpmWow >= 35, cpmWow >= 20)
            },
            {
                label: 'CTR drop vs prior',
                value: ctrDrop != null ? `${Number(ctrDrop).toFixed(0)}%` : '—',
                pct: ctrDrop != null ? Math.min(100, Math.abs(ctrDrop)) : 0,
                tone: barTone(ctrDrop >= 35, ctrDrop >= 20)
            }
        ];
    }, [saturationResult]);

    const topFatigueCreatives = useMemo(() => {
        const list = fatigueResult?.creatives;
        if (!Array.isArray(list)) return [];
        return [...list].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
    }, [fatigueResult]);

    const fatigueAvgCtrDrop = useMemo(() => {
        const list = fatigueResult?.creatives;
        if (!Array.isArray(list) || !list.length) return null;
        const drops = list.map((c) => c.ctr_drop_pct || 0).filter((x) => x > 0);
        if (!drops.length) return 0;
        return Math.round(drops.reduce((a, b) => a + b, 0) / drops.length);
    }, [fatigueResult]);

    const fatigueStatusUi = useMemo(() => {
        const s = fatigueResult?.summary;
        if (!s) return { label: '—', tone: 'mod' };
        if ((s.severe ?? 0) > 0) return { label: 'Severe', tone: 'crit' };
        if ((s.fatigued ?? 0) > 0) return { label: 'Fatigued', tone: 'warn' };
        if ((s.aging ?? 0) > 0) return { label: 'Aging', tone: 'mod' };
        return { label: 'Fresh', tone: 'ok' };
    }, [fatigueResult]);

    const freshCreativesCount = useMemo(() => fatigueResult?.summary?.fresh ?? fatigueResult?.summary?.healthy ?? 0, [fatigueResult]);

    const hookSecondsDisplay = useMemo(() => {
        const w = displayReel?.watchTime;
        if (w != null && w > 0) return `${w.toFixed(1)}s`;
        return '—';
    }, [displayReel]);

    const leadSamples = useMemo(() => (qualityScores.length ? qualityScores : (qualityResult?.samples || [])), [qualityScores, qualityResult]);

    const leadCategoryBars = useMemo(() => {
        const samples = leadSamples;
        if (!samples.length) return [];
        const map = { 'Hot Lead': 0, 'Warm Lead': 0, Nurture: 0, Cold: 0 };
        samples.forEach((s) => {
            const k = s.category || 'Cold';
            if (map[k] !== undefined) map[k] += 1;
            else if (String(k).includes('Hot')) map['Hot Lead'] += 1;
            else if (String(k).includes('Warm')) map['Warm Lead'] += 1;
            else if (String(k).includes('Nurture') || String(k).includes('Average')) map.Nurture += 1;
            else map.Cold += 1;
        });
        const total = samples.length;
        const order = [
            { key: 'Hot Lead', short: 'Hot', color: '#ef4444' },
            { key: 'Warm Lead', short: 'Warm', color: '#f97316' },
            { key: 'Nurture', short: 'Nurture', color: '#3b82f6' },
            { key: 'Cold', short: 'Cold', color: '#64748b' }
        ];
        return order.map((o) => ({ ...o, pct: Math.round((map[o.key] / total) * 100) }));
    }, [leadSamples]);

    const leadIntelStats = useMemo(() => {
        const summary = qualityResult?.summary;
        const samples = leadSamples;
        const n = samples.length;
        if (qualityResult?.success && summary && typeof summary.avg_score === 'number') {
            return {
                total: summary.total ?? n,
                avgScore: summary.avg_score,
                hotLeadRatePct: summary.hot_lead_rate_pct,
                hotWarmPct: null,
            };
        }
        if (!n) return { total: 0, avgScore: null, hotLeadRatePct: null, hotWarmPct: null };
        const sum = samples.reduce((s, r) => s + (Number(r.score) || 0), 0);
        const hot = samples.filter((r) => r.tier === 'Hot' || String(r.category || '').includes('Hot')).length;
        const warm = samples.filter((r) => r.tier === 'Warm' || (String(r.category || '').includes('Warm') && !String(r.category || '').includes('Hot'))).length;
        return {
            total: n,
            avgScore: Math.round((sum / n) * 10) / 10,
            hotLeadRatePct: Math.round((hot / n) * 1000) / 10,
            hotWarmPct: Math.round(((hot + warm) / n) * 1000) / 10,
        };
    }, [leadSamples, qualityResult]);

    const highIntentFollowups = useMemo(() => {
        const samples = leadSamples;
        return samples.filter((r) => {
            const c = String(r.category || '');
            return c.includes('Hot') || c.includes('Warm');
        }).length;
    }, [leadSamples]);

    const combinedAiInsightText = useMemo(() => {
        const first = insights[0];
        if (first?.text) return first.text;
        if (recommendations[0]?.justification) return recommendations[0].justification;
        return saturationResult?.message || '';
    }, [insights, recommendations, saturationResult]);

    const predictionSnippet = useMemo(() => {
        const rec = recommendations.find((r) => /cpl|₹|target/i.test(r.justification || r.title || ''));
        return rec?.justification || recommendations[0]?.justification || '';
    }, [recommendations]);

    const lastAnalysedLabel = useMemo(() => {
        if (!lastAnalysedAt) return '—';
        const diff = Math.floor((Date.now() - lastAnalysedAt.getTime()) / 60000);
        if (diff < 1) return 'just now';
        if (diff < 60) return `${diff} min ago`;
        const h = Math.floor(diff / 60);
        return `${h}h ago`;
    }, [lastAnalysedAt]);

    const suggestedQueries = useMemo(() => [
        'Why is CPL increasing?',
        'Which creative to pause?',
        'How to reach ₹600 CPL?',
        'Best audience segment?',
        'When will audience saturate?',
        'Best WhatsApp message today?'
    ], []);

    const fatigueCreativeInsight = useMemo(() => {
        const list = fatigueResult?.creatives || [];
        const worst = [...list].sort((a, b) => (b.fatigue_score ?? b.score ?? 0) - (a.fatigue_score ?? a.score ?? 0))[0];
        const st = (worst?.status || '').toLowerCase();
        if (worst && (st === 'severe' || st === 'fatigued')) {
            return `“${worst.ad_name || 'An ad'}” is ${worst.status} (score ${worst.fatigue_score ?? worst.score ?? '—'}). MHS: refresh hook, creative, or angle; pause if severe.`;
        }
        const sorted = [...list].sort((a, b) => (a.cpl || 0) - (b.cpl || 0));
        const best = sorted.find((c) => (c.status || '').toLowerCase() === 'fresh');
        if (best && worst && best.ad_id !== worst.ad_id) {
            return `“${best.ad_name || 'A creative'}” is Fresh; watch Aging ads and run the weekly audit (CTR, hook, CPL vs first 7d, quality, days live).`;
        }
        return recommendations[0]?.justification || currentAd.reason || 'Score = CTR drop×0.4 + age pressure×0.4 + hook drop×0.2 (creative_state.md).';
    }, [fatigueResult, recommendations, currentAd]);

    const buildAskContext = useCallback(() => {
        const reel = displayReel || resolvedCurrentReel;
        return {
            dateRange: resolvedInsightsRange,
            activePeriod: periodLabel,
            bestAd: {
                name: currentAd?.name,
                spend: currentAd?.spend,
                leads: currentAd?.leads,
                cpl: currentAd?.cpl,
                reason: currentAd?.reason,
                action: currentAd?.action
            },
            bestReel: reel
                ? {
                    name: reel.name,
                    reach: reel.reach,
                    views: reel.views,
                    engagements: reel.engagements,
                    saves: reel.saves,
                    reason: reel.reason
                }
                : null,
            insights: (insights || []).slice(0, 6).map((i) => ({
                type: i.type,
                timeWindow: i.timeWindow,
                text: i.text,
                action: i.action
            })),
            recommendations: (recommendations || []).slice(0, 4).map((r) => ({
                title: r.title,
                justification: r.justification
            })),
            leadSaturation: saturationResult
                ? {
                    level: saturationResult.saturationLevel,
                    message: saturationResult.message,
                    summary: saturationResult.summary
                        ? {
                            total: saturationResult.summary.total,
                            saturated: saturationResult.summary.saturated,
                            warning: saturationResult.summary.warning,
                            healthy: saturationResult.summary.healthy,
                            saturation_index_avg: saturationResult.summary.saturation_index_avg
                        }
                        : null
                }
                : null,
            creativeFatigue: fatigueResult?.summary ?? null,
            leadQuality: qualityResult?.summary ?? null
        };
    }, [
        resolvedInsightsRange,
        periodLabel,
        currentAd,
        displayReel,
        resolvedCurrentReel,
        insights,
        recommendations,
        saturationResult,
        fatigueResult,
        qualityResult
    ]);

    const handleAskSubmit = useCallback(async (e) => {
        e?.preventDefault?.();
        const q = String(askInput || '').trim();
        if (!q) {
            setAskHint('');
            setAskAnswer('');
            setAskError('Type a question first.');
            return;
        }
        setAskHint('');
        setAskAnswer('');
        setAskError('');
        setAskLoading(true);
        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetchJsonWithTimeout(
                `${API_BASE}/api/ai/ask`,
                {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        question: q,
                        context: buildAskContext()
                    })
                },
                ASK_AI_FETCH_TIMEOUT_MS
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setAskError(json.details || json.error || res.statusText || 'Could not get an answer.');
                return;
            }
            if (json.success && json.answer) {
                setAskAnswer(String(json.answer));
            } else {
                setAskError(json.error || 'No answer returned.');
            }
        } catch (err) {
            if (err?.name === 'AbortError') {
                setAskError(
                    'Timed out waiting for the AI — not because your question was too long. The backend or Gemini was slow or unreachable. Confirm the API server is running (restart locally or redeploy), then try again.'
                );
            } else {
                setAskError(err.message || 'Network error');
            }
        } finally {
            setAskLoading(false);
        }
    }, [askInput, buildAskContext]);

    const creativeStatusClass = (status) => {
        const s = (status || '').toLowerCase();
        if (s === 'severe') return 'crit';
        if (s === 'fatigued') return 'warn';
        if (s === 'aging') return 'aging';
        return 'fresh';
    };

    const creativeStatusLabel = (status) => status || '—';

    const scrollToId = (id) => {
        const el = document.getElementById(id);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div className={`ai-insights-v2${loading ? ' ai-insights-v2--loading' : ''}`}>
            <header className="ai2-hero">
                <div className="ai2-hero-text">
                    <div className="ai2-hero-title-row">
                        <h1 className="ai2-title">AI Insights</h1>
                        <span className="ai2-pill ai2-pill-live">
                            <span className="ai2-pill-dot" aria-hidden />
                            Live Analysis
                        </span>
                    </div>
                    <p className="ai2-sub">
                        Real-time intelligence across your lead funnel, creative performance, and marketing strategy.
                        <span className="ai2-sub-muted"> Last analysed {lastAnalysedLabel}.</span>
                    </p>
                </div>
                <div className="ai2-hero-actions">
                    <div className="ai2-date-preset-wrap" ref={datePresetWrapRef}>
                        <button
                            type="button"
                            className="ai2-date-preset-trigger"
                            title="Analysis period"
                            aria-expanded={datePresetMenuOpen}
                            aria-haspopup="listbox"
                            onClick={() => {
                                setDatePresetMenuOpen((o) => {
                                    const next = !o;
                                    if (next && insightsDatePreset === 'custom' && customCommitted.from && customCommitted.to) {
                                        setCustomDraftFrom(customCommitted.from);
                                        setCustomDraftTo(customCommitted.to);
                                    }
                                    return next;
                                });
                            }}
                        >
                            <i className="fas fa-calendar-alt" aria-hidden />
                            <span className="ai2-date-preset-label">{insightsPresetLabel}</span>
                            <span className="ai2-date-preset-range">{headerDateRangeLabel}</span>
                            <i className={`fas fa-chevron-down ai2-date-preset-caret${datePresetMenuOpen ? ' ai2-date-preset-caret--open' : ''}`} aria-hidden />
                        </button>
                        {datePresetMenuOpen && (
                            <div className="ai2-date-preset-menu" role="listbox" aria-label="Date range">
                                {INSIGHTS_DATE_PRESET_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        role="option"
                                        aria-selected={insightsDatePreset === opt.id}
                                        className={`ai2-date-preset-option${insightsDatePreset === opt.id ? ' ai2-date-preset-option--active' : ''}`}
                                        onClick={() => {
                                            setInsightsDatePreset(opt.id);
                                            if (opt.id === 'custom') {
                                                const m = getDateRangeForPreset('this_month');
                                                setCustomDraftFrom(m.from);
                                                setCustomDraftTo(m.to);
                                                setCustomCommitted({ from: m.from, to: m.to });
                                            } else {
                                                setDatePresetMenuOpen(false);
                                            }
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                                {insightsDatePreset === 'custom' && (
                                    <div className="ai2-date-custom-fields">
                                        <label className="ai2-date-custom-lbl">
                                            <span>From</span>
                                            <input
                                                type="date"
                                                className="ai2-date-custom-input"
                                                value={customDraftFrom}
                                                onChange={(e) => setCustomDraftFrom(e.target.value)}
                                            />
                                        </label>
                                        <label className="ai2-date-custom-lbl">
                                            <span>To</span>
                                            <input
                                                type="date"
                                                className="ai2-date-custom-input"
                                                value={customDraftTo}
                                                onChange={(e) => setCustomDraftTo(e.target.value)}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className="ai2-date-custom-apply"
                                            disabled={!customDraftFrom || !customDraftTo || customDraftFrom > customDraftTo}
                                            onClick={() => {
                                                setCustomCommitted({ from: customDraftFrom, to: customDraftTo });
                                                setDatePresetMenuOpen(false);
                                            }}
                                        >
                                            Apply range
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <button
                        type="button"
                        className="ai2-btn-refresh"
                        onClick={() => fetchAIInsights(true)}
                        disabled={loading}
                    >
                        <i className="fas fa-sync-alt" />
                        {loading ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>
            </header>

            {loading && (
                <div className="ai2-loading" aria-busy="true">
                    <div className="ai2-loading-spinner" />
                    <p>{loadingPhase === 'ai' ? 'Generating AI insights…' : 'Loading ads & reels…'}</p>
                </div>
            )}

            {error && !loading && (
                <div className="ai2-banner ai2-banner-error">
                    <i className="fas fa-exclamation-triangle" />
                    <span>
                        {error}
                        {quotaRetrySeconds != null && quotaRetrySeconds > 0 && (
                            <span> Retry in {quotaRetrySeconds}s.</span>
                        )}
                    </span>
                    <button
                        type="button"
                        className="ai2-btn-ghost"
                        onClick={() => fetchAIInsights(false)}
                        disabled={quotaRetrySeconds != null && quotaRetrySeconds > 0}
                    >
                        Retry
                    </button>
                </div>
            )}

            <div className="ai2-grid-2">
                <section className="ai2-card" aria-labelledby="sat-card-title">
                    <div className="ai2-card-head">
                        <div className="ai2-card-head-icon ai2-icon-amber">
                            <i className="fas fa-lightbulb" />
                        </div>
                        <div className="ai2-card-head-text">
                            <h2 id="sat-card-title" className="ai2-card-title">Lead Saturation</h2>
                            <p className="ai2-card-sub">MHS index + Signal 4 (first-time impressions) + Signal 5 (CTR × frequency × CPM)</p>
                        </div>
                        <span className={`ai2-badge ai2-badge--${saturationStatusUi.tone}`}>{saturationStatusUi.label}</span>
                    </div>

                    <div className="ai2-sat-body">
                        <div className="ai2-donut-wrap" aria-hidden>
                            <div
                                className="ai2-donut"
                                style={{ '--pct': saturationIndexPct != null ? saturationIndexPct : 0 }}
                            />
                            <div className="ai2-donut-center">
                                <span className="ai2-donut-pct">{saturationIndexPct != null ? `${saturationIndexPct}%` : '—'}</span>
                                <span className="ai2-donut-lbl">Saturation Index</span>
                            </div>
                        </div>

                        <div className="ai2-bar-list">
                            {(saturationBars.length ? saturationBars : [
                                { label: 'Frequency', value: '—', pct: 0, tone: 'neutral' },
                                { label: 'Reach % of pool', value: '—', pct: 0, tone: 'neutral' },
                                { label: 'First-time impression share', value: '—', pct: 0, tone: 'neutral' },
                                { label: 'CPM vs prior week', value: '—', pct: 0, tone: 'neutral' },
                                { label: 'CTR drop vs prior', value: '—', pct: 0, tone: 'neutral' }
                            ]).map((row) => (
                                <div key={row.label} className="ai2-bar-row">
                                    <div className="ai2-bar-meta">
                                        <span>{row.label}</span>
                                        <span className="ai2-bar-val">{row.value}</span>
                                    </div>
                                    <div className="ai2-bar-track">
                                        <span className={`ai2-bar-fill ai2-bar-fill--${row.tone}`} style={{ width: `${Math.round(row.pct)}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="ai2-insight-copy">
                        {saturationResult?.message || (saturationLoading ? 'Running saturation analysis…' : 'We pull frequency, reach, first-time impression share, CPM, and CTR from Meta (current vs prior window), estimate audience from ad sets, compute the MHS Saturation Index (0–100), and classify Signal 5 (audience saturation vs creative fatigue vs full saturation). Yellow >60, red >80; first-time impressions below 30% confirms saturation per MHS.')}
                    </p>
                    {saturationError && (
                        <p className="ai2-inline-err">{saturationError}</p>
                    )}

                    <div className="ai2-card-foot">
                        <span>
                            {saturationResult?.summary
                                ? `${saturationResult.summary.saturated ?? 0} critical · ${saturationResult.summary.warning ?? 0} warning · ${saturationResult.summary.healthy ?? 0} healthy${saturationResult.summary.saturation_index_avg != null ? ` · avg index ${saturationResult.summary.saturation_index_avg}` : ''}`
                                : 'Red zone: expand geo or lookalikes + creative. Yellow: refresh creative first.'}
                        </span>
                        <button type="button" className="ai2-link-btn" onClick={() => scrollToId('ai2-detail-sat')}>
                            View details <i className="fas fa-arrow-right" />
                        </button>
                    </div>
                </section>

                <section className="ai2-card" aria-labelledby="fatigue-card-title">
                    <div className="ai2-card-head">
                        <div className="ai2-card-head-icon ai2-icon-red">
                            <i className="fas fa-exclamation-triangle" />
                        </div>
                        <div className="ai2-card-head-text">
                            <h2 id="fatigue-card-title" className="ai2-card-title">Creative Fatigue</h2>
                            <p className="ai2-card-sub">MHS score: CTR drop×0.4 + lifespan pressure×0.4 + hook drop×0.2</p>
                        </div>
                        <span className={`ai2-badge ai2-badge--${fatigueStatusUi.tone}`}>{fatigueStatusUi.label}</span>
                    </div>

                    <div className="ai2-metric-row3">
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">CTR drop (avg)</span>
                            <span className="ai2-metric-v">
                                {fatigueAvgCtrDrop != null ? `-${fatigueAvgCtrDrop}%` : '—'}
                            </span>
                            <span className="ai2-metric-hint ai2-hint-bad">current vs prior window</span>
                        </div>
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">Avg hook / watch</span>
                            <span className="ai2-metric-v">{hookSecondsDisplay}</span>
                            <span className="ai2-metric-hint">from best reel view</span>
                        </div>
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">Fresh creatives</span>
                            <span className="ai2-metric-v">{freshCreativesCount}</span>
                            <span className={`ai2-metric-hint ${freshCreativesCount < 3 ? 'ai2-hint-warn' : ''}`}>Fresh (0–40)</span>
                        </div>
                    </div>

                    <ul className="ai2-creative-list">
                        {(topFatigueCreatives.length ? topFatigueCreatives.slice(0, 3) : [null, null, null]).map((c, i) => (
                            <li key={c?.ad_id || i} className="ai2-creative-li">
                                {c ? (
                                    <>
                                        <div className="ai2-creative-main">
                                            <span className="ai2-creative-name">{c.ad_name || c.ad_id}</span>
                                            <span className="ai2-creative-meta">
                                                CTR {typeof c.ctr === 'number' ? `${c.ctr.toFixed(2)}%` : '—'} · CPL {typeof c.cpl === 'number' ? fmtMoney(c.cpl) : '—'}
                                            </span>
                                        </div>
                                        <span className={`ai2-mini-badge ai2-mini-badge--${creativeStatusClass(c.status)}`}>
                                            {creativeStatusLabel(c.status)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="ai2-creative-placeholder">{fatigueLoading ? 'Loading…' : 'No creatives in range'}</span>
                                )}
                            </li>
                        ))}
                    </ul>

                    <p className="ai2-insight-copy">{fatigueCreativeInsight}</p>
                    {fatigueError && <p className="ai2-inline-err">{fatigueError}</p>}

                    <div className="ai2-card-foot">
                        <span>
                            {fatigueResult?.summary
                                ? `Severe ${fatigueResult.summary.severe ?? 0} · Fatigued ${fatigueResult.summary.fatigued ?? 0} · Aging ${fatigueResult.summary.aging ?? 0} · Fresh ${fatigueResult.summary.fresh ?? 0}`
                                : 'Weekly audit: CTR >30%, hook <15%, CPL vs first 7d >40%, quality below avg, days >21, neg. feedback >0.1%.'}
                        </span>
                        <button type="button" className="ai2-link-btn" onClick={() => scrollToId('ai2-detail-fatigue')}>
                            Manage creatives <i className="fas fa-arrow-right" />
                        </button>
                    </div>
                </section>
            </div>

            <div className="ai2-grid-2 ai2-grid-2--mt">
                <section className="ai2-card" aria-labelledby="lead-intel-title">
                    <div className="ai2-card-head">
                        <div className="ai2-card-head-icon ai2-icon-blue">
                            <i className="fas fa-user" />
                        </div>
                        <div className="ai2-card-head-text">
                            <h2 id="lead-intel-title" className="ai2-card-title">Lead Intelligence</h2>
                            <p className="ai2-card-sub">MHS tiers: Hot 80+ · Warm 50–79 · Nurture 25–49 · Cold 0–24</p>
                        </div>
                        <span className={`ai2-pill ai2-pill-soft ${qualityLoading ? 'ai2-pill-animate' : ''}`}>
                            {qualityLoading ? 'Analysing' : 'Live'}
                        </span>
                    </div>

                    <div className="ai2-metric-row3">
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">Scored leads</span>
                            <span className="ai2-metric-v">{leadIntelStats.total || '—'}</span>
                            <span className="ai2-metric-hint ai2-hint-good">In selected window</span>
                        </div>
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">Avg quality score</span>
                            <span className="ai2-metric-v">{leadIntelStats.avgScore != null ? `${leadIntelStats.avgScore}` : '—'}</span>
                            <span className="ai2-metric-hint">Benchmark {'>'}45 (doc)</span>
                        </div>
                        <div className="ai2-metric-box">
                            <span className="ai2-metric-k">Hot lead rate</span>
                            <span className="ai2-metric-v">{leadIntelStats.hotLeadRatePct != null ? `${leadIntelStats.hotLeadRatePct}%` : '—'}</span>
                            <span className="ai2-metric-hint ai2-hint-good">Target {'>'}25%</span>
                        </div>
                    </div>

                    <div className="ai2-seg-chart">
                        <p className="ai2-seg-title">MHS score tiers</p>
                        <div className="ai2-seg-bars">
                            {leadCategoryBars.length > 0 ? (
                                leadCategoryBars.map((seg) => (
                                    <div key={seg.key} className="ai2-seg-row">
                                        <span className="ai2-seg-label">{seg.short}</span>
                                        <div className="ai2-seg-track">
                                            <span className="ai2-seg-fill" style={{ width: `${seg.pct}%`, background: seg.color }} />
                                        </div>
                                        <span className="ai2-seg-pct">{seg.pct}%</span>
                                    </div>
                                ))
                            ) : (
                                <p className="ai2-muted">Run lead scoring or load stored scores to see segments.</p>
                            )}
                        </div>
                    </div>

                    <p className="ai2-insight-copy">
                        {combinedAiInsightText || 'Sugar poll points (40/30/20/10) + GHL/TagMango signals via Leads.lead_intel JSON. Hot = personal call within 2h; Warm = WhatsApp in 24h.'}
                    </p>
                    {qualityError && <p className="ai2-inline-err">{qualityError}</p>}

                    <div className="ai2-card-foot">
                        <span>{highIntentFollowups ? `${highIntentFollowups} high-intent leads in sample` : 'Run scoring to populate lead intelligence'}</span>
                        <button type="button" className="ai2-link-btn" onClick={() => scrollToId('ai2-detail-leads')}>
                            View segments <i className="fas fa-arrow-right" />
                        </button>
                    </div>
                </section>

                <section className="ai2-card" aria-labelledby="ai-mkt-title">
                    <div className="ai2-card-head">
                        <div className="ai2-card-head-icon ai2-icon-violet">
                            <i className="fas fa-gem" />
                        </div>
                        <div className="ai2-card-head-text">
                            <h2 id="ai-mkt-title" className="ai2-card-title">AI Marketing Intelligence</h2>
                            <p className="ai2-card-sub">Strategic recommendations &amp; predictions</p>
                        </div>
                        <span className="ai2-pill ai2-pill-actions">{recommendations.length} Actions</span>
                    </div>

                    <div className="ai2-action-list">
                        {recommendations.length === 0 && (
                            <p className="ai2-muted">Insights appear after the AI step completes. Use Refresh if empty.</p>
                        )}
                        {recommendations.map((rec) => {
                            const tone = rec.color === 'red' ? 'orange' : rec.color === 'green' ? 'green' : rec.color === 'purple' ? 'purple' : 'blue';
                            return (
                                <div key={rec.id} className={`ai2-action-item ai2-action-item--${tone}`}>
                                    <span className="ai2-action-ico" aria-hidden>{rec.icon}</span>
                                    <div>
                                        <div className="ai2-action-title">{rec.title}</div>
                                        <div className="ai2-action-body">{rec.justification}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="ai2-prediction">
                        {predictionSnippet || 'Predicted CPL depends on creative refresh, audience expansion, and bid strategy — see recommendations above.'}
                    </p>

                    <div className="ai2-card-foot">
                        <span>{recommendations.length ? 'Execute actions above to move CPL toward target' : 'Full strategy refreshes with data sync'}</span>
                        <button type="button" className="ai2-link-btn" onClick={() => scrollToId('ai2-ask')}>
                            Full strategy report <i className="fas fa-arrow-right" />
                        </button>
                    </div>
                </section>
            </div>

            <section className="ai2-ask" id="ai2-ask" aria-labelledby="ask-title">
                <div className="ai2-ask-head">
                    <div className="ai2-card-head-icon ai2-icon-purple">
                        <i className="fas fa-comment-dots" />
                    </div>
                    <div>
                        <h2 id="ask-title" className="ai2-ask-title">Ask AI Anything</h2>
                        <p className="ai2-ask-sub">Ask about your funnel, CPL, audience, creatives or strategy.</p>
                    </div>
                </div>
                <form className="ai2-ask-form" onSubmit={handleAskSubmit}>
                    <input
                        type="text"
                        className="ai2-ask-input"
                        placeholder="e.g. Why is my CPL increasing this week?"
                        value={askInput}
                        onChange={(e) => setAskInput(e.target.value)}
                        disabled={askLoading}
                        aria-busy={askLoading}
                    />
                    <button type="submit" className="ai2-btn-ask" disabled={askLoading}>
                        <i className="fas fa-paper-plane" /> {askLoading ? 'Thinking…' : 'Ask AI'}
                    </button>
                </form>
                {askHint && <p className="ai2-ask-hint">{askHint}</p>}
                {askLoading && !askHint && <p className="ai2-ask-hint ai2-ask-hint--muted">Getting an answer…</p>}
                {askError && <p className="ai2-ask-error" role="alert">{askError}</p>}
                {askAnswer && (
                    <div className="ai2-ask-response" role="region" aria-label="AI answer">
                        {askAnswer}
                    </div>
                )}
                <div className="ai2-suggest">
                    {suggestedQueries.map((q) => (
                        <button key={q} type="button" className="ai2-suggest-pill" onClick={() => { setAskInput(q); }}>
                            {q}
                        </button>
                    ))}
                </div>
            </section>

            <details className="ai2-details">
                <summary>Performance snapshot · ads &amp; reels ({periodLabel})</summary>
                <div className="ai2-time-tabs">
                    {(['lastMonth', 'lastWeek', 'thisWeek', 'today']).map((k) => (
                        <button
                            key={k}
                            type="button"
                            className={`ai2-time-tab ${activeTimeWindow === k ? 'active' : ''}`}
                            onClick={() => setActiveTimeWindow(k)}
                        >
                            {periodLabels[k]}
                        </button>
                    ))}
                </div>
                <div className="ai2-perf-mini-grid">
                    <div className="ai2-perf-mini ai2-perf-mini--ad">
                        <h3>Best ad</h3>
                        <p className="ai2-perf-name">{currentAd.name}</p>
                        {(currentAd.dateStart || currentAd.dateStop) && (
                            <p className="ai2-perf-dates">
                                {fmtDate(currentAd.dateStart)} — {fmtDate(currentAd.dateStop)}
                            </p>
                        )}
                        <p className="ai2-perf-meta">{fmtMoney(currentAd.spend)} spend · {fmtInt(currentAd.leads)} leads · {fmtMoney(currentAd.cpl)} CPL</p>
                        <p className="ai2-perf-reason">{currentAd.reason}</p>
                    </div>
                    <div className="ai2-perf-mini ai2-perf-mini--reel">
                            <h3>Best reel</h3>
                            <p className="ai2-perf-name">{(displayReel || resolvedCurrentReel)?.name || '—'}</p>
                            {(displayReel || resolvedCurrentReel)?.timestamp && (
                                <p className="ai2-perf-dates">{fmtDateTime((displayReel || resolvedCurrentReel).timestamp)}</p>
                            )}
                            <p className="ai2-perf-meta">
                                {displayReel?.hookRate != null && displayReel.hookRate > 0 ? `Hook ${displayReel.hookRate}% · ` : ''}
                                {fmtReach((displayReel || resolvedCurrentReel)?.views || (displayReel || resolvedCurrentReel)?.reach || 0)} views
                            </p>
                            <p className="ai2-perf-reason">{(displayReel || resolvedCurrentReel)?.reason || '—'}</p>
                            {displayReelFlags.length > 0 && (
                                <div className="ai2-reel-flag-row">
                                    {displayReelFlags.map((f) => (
                                        <span key={f} className="ai2-mini-pill" style={{ background: flagColors[f] }}>
                                            <i className={`fas ${flagIcons[f]}`} /> {flagLabels[f]}
                                        </span>
                                    ))}
                                </div>
                            )}
                    </div>
                </div>
            </details>

            {reelAnalysis && (
                <details className="ai2-details">
                    <summary>Reel intelligence (trending, repost, rising)</summary>
                    <div className="ai2-reel-intel-compact">
                        {['trending_reels', 'repost_recommended', 'rising_reels'].map((key) => (
                            <div key={key} className="ai2-reel-col">
                                <h4>{key.replace(/_/g, ' ')}</h4>
                                <ul>
                                    {(reelAnalysis[key] || []).slice(0, 3).map((reel, i) => (
                                        <li key={i}>{reel.name} · {fmtReach(reel.views)} views</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            <div className="ai2-insights-feed" id="ai2-strategy-feed">
                <h3 className="ai2-h3">AI insight feed</h3>
                <div className="ai2-feed-list">
                    {insights.map((insight) => (
                        <div key={insight.id} className={`ai2-feed-card ai2-feed-card--${insight.category || 'info'}`}>
                            <div className="ai2-feed-head">
                                <span>{insight.type}</span>
                                <span className="ai2-feed-tw">{insight.timeWindow}</span>
                            </div>
                            <p>{insight.text}</p>
                            <div className="ai2-feed-action">{insight.action}</div>
                        </div>
                    ))}
                </div>
            </div>

            <section id="ai2-detail-sat" className="ai2-detail-block">
                <h3 className="ai2-h3">Lead saturation · campaigns</h3>
                <button type="button" className="ai2-btn-secondary" onClick={fetchLeadSaturation} disabled={saturationLoading}>
                    {saturationLoading ? 'Analysing…' : 'Re-run analysis'}
                </button>
                {saturationResult?.campaigns?.length > 0 && (
                    <div className="ai2-table-wrap">
                        <table className="ai2-table">
                            <thead>
                                <tr>
                                    <th>Ad account</th>
                                    <th>Campaign</th>
                                    <th>Freq</th>
                                    <th>Freq Δ</th>
                                    <th>Reach %</th>
                                    <th>Index</th>
                                    <th>CPM Δ</th>
                                    <th>CTR Δ</th>
                                    <th>1st imp %</th>
                                    <th>Signal 5</th>
                                    <th>Days*</th>
                                    <th>CPL</th>
                                    <th>Dup %</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {saturationResult.campaigns.map((c, i) => (
                                    <tr key={c.campaign_id || i}>
                                        <td
                                            className={c.ad_account_name?.trim() ? undefined : 'ai2-td-mono'}
                                            title={
                                                c.ad_account_name?.trim()
                                                    ? fmtAdAccountId(c.ad_account_id)
                                                    : undefined
                                            }
                                        >
                                            {c.ad_account_name?.trim() || fmtAdAccountId(c.ad_account_id)}
                                        </td>
                                        <td>{c.campaign_name || c.campaign_id}</td>
                                        <td>{typeof c.frequency === 'number' ? c.frequency.toFixed(2) : '—'}</td>
                                        <td>
                                            {c.freq_wow_pct != null
                                                ? `${c.freq_wow_pct > 0 ? '+' : ''}${Number(c.freq_wow_pct).toFixed(0)}%`
                                                : '—'}
                                        </td>
                                        <td>
                                            {c.reach_pct != null
                                                ? `${Number(c.reach_pct).toFixed(0)}%${c.reach_pct_is_estimated ? ' ~' : ''}`
                                                : '—'}
                                        </td>
                                        <td>{c.saturation_index != null ? Number(c.saturation_index).toFixed(0) : (c.score ?? '—')}</td>
                                        <td>{c.cpm_wow_pct != null ? `${c.cpm_wow_pct > 0 ? '+' : ''}${Number(c.cpm_wow_pct).toFixed(0)}%` : '—'}</td>
                                        <td>{c.ctr_drop_pct != null ? `${Number(c.ctr_drop_pct).toFixed(0)}%` : '—'}</td>
                                        <td>
                                            {c.first_time_impression_pct != null
                                                ? `${Number(c.first_time_impression_pct).toFixed(0)}%`
                                                : '—'}
                                        </td>
                                        <td title={c.signal5_fix || undefined}>
                                            {c.signal5_label || '—'}
                                        </td>
                                        <td>
                                            {c.days_until_saturation_adjusted != null
                                                ? `${Math.round(c.days_until_saturation_adjusted)}${c.days_is_estimated ? ' ~' : ''}`
                                                : '—'}
                                        </td>
                                        <td>{typeof c.cpl === 'number' ? fmtMoney(c.cpl) : '—'}</td>
                                        <td>{typeof c.duplicate_rate === 'number' ? `${c.duplicate_rate.toFixed(1)}%` : '—'}</td>
                                        <td>{c.status}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="ai2-muted ai2-table-footnote">
                            *<strong>Meta</strong> audience = ad set estimate or <strong>reachestimate</strong> (full targeting, then geo/demographic only). Values marked <strong>~</strong> use frequency-band heuristics for display only; <strong>status</strong> and <strong>index</strong> still use Meta reach when available, otherwise frequency + CPM/CTR.
                            {' '}
                            <strong>Signal 4</strong>: first-time impression % from Meta (impression-weighted); below 30% confirms saturation. If Meta omits the field, 1st imp % shows —.
                            {' '}
                            <strong>Signal 5</strong>: CTR drop vs prior + frequency Δ + CPM Δ — hover the cell for the MHS fix (expand audience / change creative / urgent).
                            {' '}
                            Exact Days (MHS) = (15% × audience estimate) ÷ daily reach ÷ 3.5 when Meta provides an audience size.
                        </p>
                    </div>
                )}
            </section>

            <section id="ai2-detail-fatigue" className="ai2-detail-block">
                <h3 className="ai2-h3">Creative fatigue · ads</h3>
                <button type="button" className="ai2-btn-secondary" onClick={fetchCreativeFatigue} disabled={fatigueLoading}>
                    {fatigueLoading ? 'Analysing…' : 'Re-run analysis'}
                </button>
                {fatigueResult?.creatives?.length > 0 && (
                    <div className="ai2-table-wrap">
                        <table className="ai2-table">
                            <thead>
                                <tr>
                                    <th>Ad account</th>
                                    <th>Creative</th>
                                    <th>Freq</th>
                                    <th>Hook %</th>
                                    <th>CTR %</th>
                                    <th>CTR Δ</th>
                                    <th>CPL</th>
                                    <th>1st7 Δ</th>
                                    <th>Score</th>
                                    <th>Audit</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {fatigueResult.creatives.map((c, i) => {
                                    const auditKeys = c.weekly_audit
                                        ? Object.entries(c.weekly_audit)
                                              .filter(([, v]) => v)
                                              .map(([k]) => k)
                                              .join(', ')
                                        : '';
                                    return (
                                    <tr key={c.ad_id || i}>
                                        <td
                                            className={c.ad_account_name?.trim() ? undefined : 'ai2-td-mono'}
                                            title={
                                                c.ad_account_name?.trim()
                                                    ? fmtAdAccountId(c.ad_account_id)
                                                    : undefined
                                            }
                                        >
                                            {c.ad_account_name?.trim() || fmtAdAccountId(c.ad_account_id)}
                                        </td>
                                        <td>{c.ad_name || c.ad_id}</td>
                                        <td>{typeof c.frequency === 'number' ? c.frequency.toFixed(2) : '—'}</td>
                                        <td title={c.hook_signal_band || undefined}>
                                            {c.hook_rate != null ? `${Number(c.hook_rate).toFixed(1)}%` : '—'}
                                        </td>
                                        <td>{typeof c.ctr === 'number' ? `${c.ctr.toFixed(2)}%` : '—'}</td>
                                        <td>
                                            {c.ctr_drop_pct != null && c.ctr_drop_pct > 0
                                                ? `${Number(c.ctr_drop_pct).toFixed(0)}%`
                                                : '—'}
                                        </td>
                                        <td>{typeof c.cpl === 'number' ? fmtMoney(c.cpl) : '—'}</td>
                                        <td>
                                            {c.cpl_increase_first7_pct != null && c.cpl_increase_first7_pct > 0
                                                ? `+${Number(c.cpl_increase_first7_pct).toFixed(0)}%`
                                                : '—'}
                                        </td>
                                        <td>{c.fatigue_score != null ? Number(c.fatigue_score).toFixed(1) : (c.score != null ? Number(c.score).toFixed(1) : '—')}</td>
                                        <td className="ai2-td-mono" title={auditKeys || undefined}>
                                            {c.weekly_audit_count != null && c.weekly_audit_count > 0
                                                ? `${c.weekly_audit_count}`
                                                : '0'}
                                        </td>
                                        <td>
                                            <span className={`ai2-mini-badge ai2-mini-badge--${creativeStatusClass(c.status)}`}>
                                                {creativeStatusLabel(c.status)}
                                            </span>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <p className="ai2-muted ai2-table-footnote">
                            <strong>MHS creative_state.md</strong>: Fatigue score = CTR drop×0.4 + (days ÷ adjusted lifespan)×100×0.4 + hook drop×0.2.
                            Adjusted lifespan = ((audience × 3) ÷ daily reach) × 0.25. Status bands: Fresh 0–40, Aging 40–70, Fatigued 70–100, Severe 100+.
                            <strong> Audit</strong> column = count of weekly checklist flags (hover for keys). Hook = 3s views ÷ impressions (else plays ÷ impressions).
                        </p>
                    </div>
                )}
            </section>

            <section id="ai2-detail-leads" className="ai2-detail-block">
                <h3 className="ai2-h3">Lead intelligence · scoring</h3>
                <button type="button" className="ai2-btn-secondary" onClick={fetchLeadQuality} disabled={qualityLoading}>
                    {qualityLoading ? 'Scoring…' : 'Run scoring'}
                </button>
                {qualityResult?.success && (
                    <p className="ai2-muted">
                        Scored {Math.max(qualityResult.scored ?? 0, qualityResult.samples?.length ?? 0)} lead(s) from your Leads data in this period.
                        {qualityResult.summary?.avg_score != null && (
                            <>
                                {' '}
                                Avg {qualityResult.summary.avg_score} · Hot {qualityResult.summary.hot_lead_rate_pct ?? '—'}%
                            </>
                        )}
                    </p>
                )}
                {(qualityScores.length > 0 || (qualityResult && qualityResult.samples?.length > 0)) && (
                    <div className="ai2-table-wrap">
                        <table className="ai2-table">
                            <thead>
                                <tr>
                                    <th>Lead</th>
                                    <th>Sugar segment</th>
                                    <th>Score</th>
                                    <th>Tier</th>
                                    <th>Category</th>
                                    <th>Next action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(qualityResult?.samples ?? qualityScores).slice(0, 50).map((r, i) => (
                                    <tr key={r.lead_id || r.phone || i}>
                                        <td>{r.name || r.phone || '—'}</td>
                                        <td>{r.sugar_segment ?? r.score_breakdown?.sugar_segment ?? '—'}</td>
                                        <td>{r.score ?? '—'}</td>
                                        <td>{inferLeadTierFromRow(r)}</td>
                                        <td>{r.category || '—'}</td>
                                        <td className="ai2-muted" style={{ fontSize: '0.72rem', maxWidth: '220px' }}>
                                            {r.action_timing || mhsLeadTierActionTiming(inferLeadTierFromRow(r))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="ai2-muted ai2-table-footnote">
                            <strong>lead-intaligetionn-state.md</strong>: Sugar {'>'}250 +40, 180–250 +30, 126–180 +20, {'<'}126 +10.
                            Behavioural points from <code>Leads.lead_intel</code> (whatsapp_open_1h, click_link, reply_message, payment_page_visit, masterclass_attend, ask_question, previous_buyer, age).
                            Run <code>server/migrations/lead-scores-mhs-intelligence.sql</code> for full persistence.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );

}