import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import MultiSelectFilter from '../components/MultiSelectFilter';
import DateRangeFilter from '../components/DateRangeFilter';
import './BestPerformingReel.css';
import {
    ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

// Helper to get auth token
const getAuthToken = () => {
    try {
        const STORAGE_KEY = process.env.REACT_APP_STORAGE_KEY || "app_auth";
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const data = JSON.parse(stored);
            return data.token;
        }
    } catch (e) {
        console.error("Error getting token:", e);
    }
    return null;
};

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';

const fetchPages = async () => {
    try {
        const token = getAuthToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/api/meta/pages`, { headers });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error('API error fetching pages:', errorData);
            return [];
        }
        const data = await res.json();
        return data.data || [];
    } catch (e) {
        console.error('Error fetching pages:', e);
        return [];
    }
};

const fetchInstagramInsights = async (pageId, from, to) => {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(
        `${API_BASE}/api/meta/instagram/insights?pageIds=${encodeURIComponent(pageId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    return res.json();
};

const fetchInstagramMediaInsights = async (pageId) => {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(
        `${API_BASE}/api/meta/instagram/media-insights?pageIds=${encodeURIComponent(pageId)}`,
        { headers }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    return res.json();
};

const fetchInstagramAudienceDemographics = async (pageId, timeframe) => {
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(
        `${API_BASE}/api/meta/instagram-audience-demographics?page_id=${encodeURIComponent(pageId)}&timeframe=${encodeURIComponent(timeframe)}`,
        { headers }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || res.statusText);
    }
    const json = await res.json();
    return json.data || null;
};

const getContentDefaultDates = () => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 6);
    return {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10)
    };
};

export default function BestPerformingReel() {
    // --- FILTER STATE (same as Audience: Time Range, Platform, Page) ---
    const [contentFilters, setContentFilters] = useState(() => getContentDefaultDates());
    const [contentDateRange, setContentDateRange] = useState('last_7_days');
    const [showContentDateRangeFilter, setShowContentDateRangeFilter] = useState(false);
    const [contentDateRangeFilterValue, setContentDateRangeFilterValue] = useState(null);

    const platformFilterOptions = [
        { id: 'all', name: 'All Platforms' },
        { id: 'facebook', name: 'Facebook' },
        { id: 'instagram', name: 'Instagram' },
        { id: 'audience_network', name: 'Audience Network' },
        { id: 'messenger', name: 'Messenger' },
        { id: 'threads', name: 'Threads' },
        { id: 'whatsapp', name: 'WhatsApp' },
    ];
    const [platformFilters, setPlatformFilters] = useState([]);
    const [pages, setPages] = useState([]);
    const [reelPage, setReelPage] = useState(null); // single page id (e.g. for "Doctor Farmer")

    const [activeTab, setActiveTab] = useState('all');
    const [error, setError] = useState(null);
    const [activeChart, setActiveChart] = useState(null);

    // Live Meta data
    const [igInsights, setIgInsights] = useState(null);
    const [mediaInsights, setMediaInsights] = useState(null);
    const [audienceData, setAudienceData] = useState(null);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [loadingAudience, setLoadingAudience] = useState(false);
    const [insightsError, setInsightsError] = useState(null);
    const [mediaError, setMediaError] = useState(null);
    const [audienceError, setAudienceError] = useState(null);

    useEffect(() => {
        const loadPages = async () => {
            const pagesData = await fetchPages();
            setPages(pagesData || []);
        };
        loadPages();
    }, []);

    // Fetch Instagram account insights (views, reach, interactions) when page + date range selected
    useEffect(() => {
        if (!reelPage || !contentFilters.startDate || !contentFilters.endDate) {
            setIgInsights(null);
            setInsightsError(null);
            return;
        }
        let cancelled = false;
        setLoadingInsights(true);
        setInsightsError(null);
        fetchInstagramInsights(reelPage, contentFilters.startDate, contentFilters.endDate)
            .then((data) => {
                if (!cancelled) setIgInsights(data);
            })
            .catch((err) => {
                if (!cancelled) setInsightsError(err?.message || 'Failed to load insights');
            })
            .finally(() => {
                if (!cancelled) setLoadingInsights(false);
            });
        return () => { cancelled = true; };
    }, [reelPage, contentFilters.startDate, contentFilters.endDate]);

    // Fetch media insights (reels with views, likes, comments, hook rate) for top content
    useEffect(() => {
        if (!reelPage) {
            setMediaInsights(null);
            setMediaError(null);
            return;
        }
        let cancelled = false;
        setLoadingMedia(true);
        setMediaError(null);
        fetchInstagramMediaInsights(reelPage)
            .then((data) => {
                if (!cancelled) setMediaInsights(data);
            })
            .catch((err) => {
                if (!cancelled) setMediaError(err?.message || 'Failed to load media insights');
            })
            .finally(() => {
                if (!cancelled) setLoadingMedia(false);
            });
        return () => { cancelled = true; };
    }, [reelPage]);

    // Fetch audience demographics (age, gender, location) when page selected
    useEffect(() => {
        if (!reelPage) {
            setAudienceData(null);
            setAudienceError(null);
            return;
        }
        const start = new Date(contentFilters.startDate);
        const end = new Date(contentFilters.endDate);
        const days = Math.round((end - start) / (1000 * 60 * 60 * 24));
        const timeframe = days <= 8 ? 'this_week' : 'this_month';
        let cancelled = false;
        setLoadingAudience(true);
        setAudienceError(null);
        fetchInstagramAudienceDemographics(reelPage, timeframe)
            .then((data) => { if (!cancelled) setAudienceData(data); })
            .catch((err) => {
                if (!cancelled) setAudienceError(err?.message || 'Failed to load audience');
            })
            .finally(() => {
                if (!cancelled) setLoadingAudience(false);
            });
        return () => { cancelled = true; };
    }, [reelPage, contentFilters.startDate, contentFilters.endDate]);

    const handleContentDateRangeApply = (payload) => {
        if (!payload.start_date || !payload.end_date) return;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(payload.start_date) || !dateRegex.test(payload.end_date)) return;
        setContentDateRangeFilterValue(payload);
        setContentDateRange(payload.range_type || 'custom');
        setContentFilters({ startDate: payload.start_date, endDate: payload.end_date });
        setShowContentDateRangeFilter(false);
    };

    const getContentDateRangeDisplay = () => {
        if (contentDateRangeFilterValue) {
            if (contentDateRangeFilterValue.range_type === 'custom') {
                const start = new Date(contentDateRangeFilterValue.start_date);
                const end = new Date(contentDateRangeFilterValue.end_date);
                return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            }
            const presetLabels = {
                today: 'Today', yesterday: 'Yesterday', today_yesterday: 'Today & Yesterday',
                last_7_days: 'Last 7 days', last_14_days: 'Last 14 days', last_28_days: 'Last 28 days',
                last_30_days: 'Last 30 days', this_week: 'This week', last_week: 'Last week',
                this_month: 'This month', last_month: 'Last month', maximum: 'Maximum'
            };
            return presetLabels[contentDateRangeFilterValue.range_type] || contentDateRange;
        }
        const presetLabels = {
            last_7_days: 'Last 7 days', last_14_days: 'Last 14 days', last_30_days: 'Last 30 days',
            this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month'
        };
        return presetLabels[contentDateRange] || 'Last 7 days';
    };

    // --- DERIVED METRICS FROM LIVE META DATA ---
    const reelsFromMedia = (mediaInsights?.media || []).filter(
        (m) => m.product_type === 'REELS' && m.availability === 'available' && (m.video_views ?? 0) >= 0
    );
    const totalViewsLive = igInsights?.totalViews ?? 0;
    const totalReachLive = igInsights?.totalReached ?? 0;
    const totalInteractionsLive = igInsights?.totalInteractions ?? 0;
    const engagementRateLive = totalReachLive > 0
        ? Math.round((totalInteractionsLive / totalReachLive) * 10000) / 100
        : 0;
    const totalWatchTimeSeconds = reelsFromMedia.reduce(
        (sum, m) => sum + (Number(m.video_avg_time_watched || 0) * Number(m.video_views || 0)),
        0
    );
    const watchTimeDisplay = totalWatchTimeSeconds >= 3600
        ? `${(totalWatchTimeSeconds / 3600).toFixed(1)}K h`
        : totalWatchTimeSeconds >= 60
            ? `${(totalWatchTimeSeconds / 60).toFixed(0)}K m`
            : `${totalWatchTimeSeconds} s`;
    const hookRates = reelsFromMedia.map((m) => m.hook_rate).filter((r) => r != null && !Number.isNaN(r));
    const median = (arr) => {
        if (!arr.length) return 0;
        const s = [...arr].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    const medianHookRate = median(hookRates);
    const contentWinRateLive = hookRates.length > 0
        ? Math.round((hookRates.filter((r) => r >= medianHookRate).length / hookRates.length) * 100)
        : 0;
    const avgHookRateLive = hookRates.length > 0
        ? Math.round((hookRates.reduce((a, b) => a + b, 0) / hookRates.length) * 100) / 100
        : null;

    const ageBreakdown = audienceData?.age_breakdown || [];
    const genderBreakdown = audienceData?.gender_breakdown || [];
    const locationBreakdown = (audienceData?.country_breakdown || []).slice(0, 10);

    const topContentByViews = [...reelsFromMedia]
        .sort((a, b) => (b.video_views || 0) - (a.video_views || 0))
        .slice(0, 20)
        .map((m, idx) => ({
            id: m.media_id || idx,
            title: (m.caption && m.caption.slice(0, 50)) || `Reel ${idx + 1}`,
            timestamp: m.timestamp,
            views: m.video_views || 0,
            likes: m.likes || 0,
            comments: m.comments || 0,
            shares: 0,
            permalink: m.permalink,
        }));

    const loadingAny = loadingInsights || loadingMedia || loadingAudience;
    const hasLiveData = reelPage && (igInsights || mediaInsights || audienceData);
    const displayError = insightsError || mediaError || audienceError || error;

    // 1. Chart Data (Views vs Engagements) - use live total when available
    const viewsData = [
        { date: '02 Nov', views: 2400, eng: 40 },
        { date: '03 Nov', views: 2900, eng: 35 },
        { date: '04 Nov', views: 3500, eng: 60 },
        { date: '05 Nov', views: 3400, eng: 55 },
        { date: '06 Nov', views: 3200, eng: 50 },
        { date: '07 Nov', views: 3100, eng: 45 },
        { date: '08 Nov', views: 2200, eng: 30 },
        { date: '09 Nov', views: 2300, eng: 40 },
        { date: '10 Nov', views: 3600, eng: 65 },
        { date: '11 Nov', views: 3000, eng: 45 },
        { date: '12 Nov', views: 3000, eng: 50 },
        { date: '13 Nov', views: 3100, eng: 60 },
        { date: '14 Nov', views: 2500, eng: 55 },
        { date: '15 Nov', views: 1800, eng: 40 },
        { date: '16 Nov', views: 2000, eng: 35 },
        { date: '17 Nov', views: 2900, eng: 90 },
        { date: '18 Nov', views: 2800, eng: 20 },
        { date: '19 Nov', views: 2700, eng: 25 },
        { date: '20 Nov', views: 2750, eng: 30 },
        { date: '21 Nov', views: 2200, eng: 25 },
        { date: '22 Nov', views: 1700, eng: 35 },
        { date: '23 Nov', views: 1900, eng: 40 },
        { date: '24 Nov', views: 2600, eng: 35 },
        { date: '25 Nov', views: 2500, eng: 30 },
        { date: '26 Nov', views: 2400, eng: 20 },
        { date: '27 Nov', views: 2100, eng: 25 },
        { date: '28 Nov', views: 1900, eng: 30 },
    ];

    // 2. Subscriber Change Data
    const subData = [
        { date: '02 Nov', val: 15 },
        { date: '04 Nov', val: 18 },
        { date: '06 Nov', val: 14 },
        { date: '08 Nov', val: 16 },
        { date: '10 Nov', val: 12 },
        { date: '12 Nov', val: 17 },
        { date: '14 Nov', val: 15 },
        { date: '16 Nov', val: 19 },
        { date: '18 Nov', val: 9 },
        { date: '20 Nov', val: 22 },
        { date: '22 Nov', val: 10 },
        { date: '24 Nov', val: 11 },
        { date: '26 Nov', val: 8 },
        { date: '28 Nov', val: 15 },
        { date: '30 Nov', val: 14 },
        { date: '01 Dec', val: 12 },
        { date: '02 Dec', val: 13 },
        { date: '03 Dec', val: 15 },
        { date: '04 Dec', val: 14 },
        { date: '05 Dec', val: 6 },
        { date: '06 Dec', val: 10 },
    ];

    // Chart Data for new KPIs
    const watchTimeData = [
        { time: '0-30s', value: 1200 },
        { time: '30-60s', value: 2800 },
        { time: '1-2min', value: 3500 },
        { time: '2-5min', value: 2100 },
        { time: '5-10min', value: 1500 },
        { time: '10+ min', value: 900 },
    ];

    const ageData = [
        { age: '18-24', value: 25, color: '#fb923c' },
        { age: '25-34', value: 35, color: '#fdba74' },
        { age: '35-44', value: 20, color: '#fca5a5' },
        { age: '45-54', value: 12, color: '#86efac' },
        { age: '55+', value: 8, color: '#fde047' },
    ];

    const genderData = [
        { name: 'Male', value: 55, color: '#0369a1' },
        { name: 'Female', value: 42, color: '#ec4899' },
        { name: 'Other', value: 3, color: '#8b5cf6' },
    ];

    const locationData = [
        { location: 'United States', value: 35, color: '#0369a1' },
        { location: 'United Kingdom', value: 18, color: '#38bdf8' },
        { location: 'Canada', value: 12, color: '#0ea5e9' },
        { location: 'Australia', value: 10, color: '#60a5fa' },
        { location: 'Germany', value: 8, color: '#3b82f6' },
        { location: 'Other', value: 17, color: '#94a3b8' },
    ];

    const COLORS = ['#0369a1', '#38bdf8', '#0ea5e9', '#60a5fa', '#3b82f6', '#8b5cf6', '#ec4899', '#fb923c'];

    const watchTimeChartData = hasLiveData && reelsFromMedia.length > 0
        ? [{ time: 'Total (min)', value: Math.round(totalWatchTimeSeconds / 60) }]
        : watchTimeData;
    const ageChartData = hasLiveData && ageBreakdown.length > 0
        ? ageBreakdown.map((r, i) => ({ age: r.age || r.age_range || 'N/A', value: r.value, color: COLORS[i % COLORS.length] }))
        : ageData;
    const genderChartData = hasLiveData && genderBreakdown.length > 0
        ? genderBreakdown.map((r, i) => ({ name: r.gender || String(r.name || 'N/A'), value: r.value, color: COLORS[i % COLORS.length] }))
        : genderData;
    const locationChartData = hasLiveData && locationBreakdown.length > 0
        ? locationBreakdown.map((r, i) => ({ location: r.country || r.location || 'N/A', value: r.value, color: COLORS[i % COLORS.length] }))
        : locationData;

    // 3. DATASETS FOR TABS
    const videoList = [
        { id: 1, url: 'https://example.com/video_51', title: 'Example Tutorial Video 51', type: 'videoOnDemand', views: 12970, watch: 48539, likes: 89, shares: 215, comments: 4, rate: '2.37%', avgView: '27.06', subChange: 85, imgColor: '#fb923c' },
        { id: 2, url: 'https://example.com/video_30', title: 'Sample Video Content 30', type: 'videoOnDemand', views: 9026, watch: 18216, likes: 51, shares: 60, comments: 1, rate: '1.24%', avgView: '36.07', subChange: 53, imgColor: '#fdba74' },
        { id: 3, url: 'https://example.com/shorts_64', title: 'Sample Educational Content 64', type: 'shorts', views: 8942, watch: 1647, likes: 51, shares: 6, comments: 0, rate: '0.64%', avgView: '135.47', subChange: 17, imgColor: '#fca5a5' },
        { id: 4, url: 'https://example.com/video_127', title: 'Sample Presentation Video 127', type: 'videoOnDemand', views: 3325, watch: 8105, likes: 31, shares: 25, comments: 4, rate: '1.80%', avgView: '24.34', subChange: 23, imgColor: '#86efac' },
        { id: 5, url: 'https://example.com/shorts_97', title: 'Sample Presentation Video 97', type: 'shorts', views: 2362, watch: 1940, likes: 5, shares: 4, comments: 0, rate: '0.38%', avgView: '207.00', subChange: 0, imgColor: '#fde047' },
    ];

    const postsList = [
        { id: 1, url: 'https://example.com/post_101', title: 'New Product Announcement', type: 'Post', views: 15400, watch: 0, likes: 450, shares: 120, comments: 34, rate: '4.1%', avgView: 'N/A', subChange: 45, imgColor: '#60a5fa' },
        { id: 2, url: 'https://example.com/post_102', title: 'Community Update - November', type: 'Post', views: 11200, watch: 0, likes: 320, shares: 80, comments: 12, rate: '3.5%', avgView: 'N/A', subChange: 22, imgColor: '#93c5fd' },
        { id: 3, url: 'https://example.com/post_103', title: 'Holiday Sale Teaser', type: 'Post', views: 22000, watch: 0, likes: 890, shares: 340, comments: 150, rate: '8.2%', avgView: 'N/A', subChange: 110, imgColor: '#3b82f6' },
        { id: 4, url: 'https://example.com/post_104', title: 'Behind the Scenes Photo', type: 'Post', views: 9800, watch: 0, likes: 210, shares: 40, comments: 8, rate: '2.8%', avgView: 'N/A', subChange: 12, imgColor: '#2563eb' },
    ];

    const storiesList = [
        { id: 1, url: 'https://example.com/story_501', title: 'Daily Vlog: Morning Coffee', type: 'Story', views: 5600, watch: 2800, likes: 120, shares: 10, comments: 2, rate: '2.1%', avgView: '85.5', subChange: 5, imgColor: '#a78bfa' },
        { id: 2, url: 'https://example.com/story_502', title: 'Q&A Session Highlights', type: 'Story', views: 4800, watch: 2400, likes: 95, shares: 12, comments: 8, rate: '2.0%', avgView: '78.2', subChange: 8, imgColor: '#c4b5fd' },
        { id: 3, url: 'https://example.com/story_503', title: 'Quick Tip #4', type: 'Story', views: 6200, watch: 3100, likes: 150, shares: 25, comments: 5, rate: '2.9%', avgView: '90.1', subChange: 15, imgColor: '#8b5cf6' },
    ];

    const reelsList = [
        { id: 1, url: 'https://example.com/reel_201', title: 'Best Reel Highlights 2024', type: 'Reel', views: 18500, watch: 42000, likes: 620, shares: 95, comments: 42, rate: '5.2%', avgView: '135.2', subChange: 128, imgColor: '#ec4899' },
        { id: 2, url: 'https://example.com/reel_202', title: 'Tutorial Reel - Quick Tips', type: 'Reel', views: 12200, watch: 28800, likes: 380, shares: 58, comments: 28, rate: '3.8%', avgView: '142.0', subChange: 76, imgColor: '#f472b6' },
        { id: 3, url: 'https://example.com/reel_203', title: 'Behind the Scenes Reel', type: 'Reel', views: 9600, watch: 19200, likes: 290, shares: 44, comments: 15, rate: '3.1%', avgView: '98.5', subChange: 52, imgColor: '#fb7185' },
        { id: 4, url: 'https://example.com/reel_204', title: 'Product Launch Reel', type: 'Reel', views: 21400, watch: 51200, likes: 890, shares: 132, comments: 68, rate: '6.4%', avgView: '168.3', subChange: 195, imgColor: '#db2777' },
    ];

    // Totals for the table footer (Dynamic based on selected data)
    const calculateTotals = (data) => {
        return data.reduce((acc, curr) => ({
            views: acc.views + curr.views,
            watch: acc.watch + curr.watch,
            likes: acc.likes + curr.likes,
            shares: acc.shares + curr.shares,
            comments: acc.comments + curr.comments,
            subChange: acc.subChange + curr.subChange,
            rate: 'N/A', // Simplified
            avgView: 'N/A'
        }), { views: 0, watch: 0, likes: 0, shares: 0, comments: 0, subChange: 0 });
    };

    // LOGIC TO SWITCH CONTENT
    let currentList = videoList;
    let tableTitle = 'Video Performance';
    let animClass = 'anim-fade-in';

    if (activeTab === 'posts') {
        currentList = postsList;
        tableTitle = 'Posts Performance';
        animClass = 'anim-slide-in';
    } else if (activeTab === 'stories') {
        currentList = storiesList;
        tableTitle = 'Stories Performance';
        animClass = 'anim-zoom-in';
    } else if (activeTab === 'reels') {
        currentList = reelsList;
        tableTitle = 'Reels Performance';
        animClass = 'anim-fade-in';
    }

    const totals = calculateTotals(currentList);

    // Format large numbers for card display (e.g. 606100 -> "606.1K", 7000 -> "7K")
    const formatCount = (n) => {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return String(n);
    };

    const getPublishDate = (item) => {
        if (item.timestamp) {
            try {
                const d = new Date(item.timestamp);
                return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
            } catch (_) {
                return '';
            }
        }
        const day = (item.id % 28) || 1;
        const month = ['January', 'February', 'March', 'April', 'May', 'June'][item.id % 6];
        const hour = 17;
        const min = (item.id * 17) % 60;
        return `${day} ${month} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    const contentListForTopContent = (activeTab === 'all' || activeTab === 'reels') && hasLiveData && topContentByViews.length > 0
        ? topContentByViews
        : currentList;

    const topContentScrollRef = useRef(null);
    const scrollTopContent = () => {
        if (topContentScrollRef.current) {
            topContentScrollRef.current.scrollBy({ left: 280, behavior: 'smooth' });
        }
    };

    return (
        <div className="best-reel-container">
            {/* --- TOP FILTERS (Time Range, Platform, Page — same as Audience) --- */}
            <motion.div
                className="filter-card best-reel-filters mb-4"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="filter-card-body">
                    <div className="row g-3 align-items-center">
                        <div className="col-12 col-md-auto">
                            <label className="filter-label">
                                <span className="filter-emoji">📅</span> TIME RANGE
                            </label>
                            <button
                                type="button"
                                className="best-reel-filter-input d-flex align-items-center gap-2 px-3 py-2 border shadow-sm cursor-pointer"
                                onClick={() => setShowContentDateRangeFilter(true)}
                            >
                                <i className="far fa-calendar-alt text-secondary opacity-75"></i>
                                <span className="fw-medium small text-dark flex-grow-1 text-center" style={{ fontSize: '0.8rem' }}>
                                    {getContentDateRangeDisplay()}
                                </span>
                                <i className="fas fa-chevron-down text-secondary opacity-50 small"></i>
                            </button>
                        </div>
                        <div className="col-12 col-md-auto">
                            <MultiSelectFilter
                                label="PLATFORM"
                                emoji="🌐"
                                options={platformFilterOptions}
                                selectedValues={platformFilters.map((p) => p.id)}
                                onChange={(selectedIds) => setPlatformFilters(platformFilterOptions.filter((p) => selectedIds.includes(p.id)))}
                                placeholder="Select platform"
                                getOptionLabel={(opt) => opt.name}
                                getOptionValue={(opt) => opt.id}
                            />
                        </div>
                        <div className="col-12 col-md-auto">
                            <MultiSelectFilter
                                label="PAGE"
                                emoji="📄"
                                options={pages}
                                selectedValues={reelPage ? [reelPage] : []}
                                onChange={(selectedIds) => setReelPage(selectedIds.length ? selectedIds[0] : null)}
                                placeholder="Select a Page"
                                getOptionLabel={(opt) => opt.name}
                                getOptionValue={(opt) => opt.id}
                            />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* --- NAVIGATION TABS --- */}
            <div className="nav-tabs-custom">
                <button className={`nav-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All</button>
                <button className={`nav-tab-btn ${activeTab === 'posts' ? 'active' : ''}`} onClick={() => setActiveTab('posts')}>Posts</button>
                <button className={`nav-tab-btn ${activeTab === 'stories' ? 'active' : ''}`} onClick={() => setActiveTab('stories')}>Stories</button>
                <button className={`nav-tab-btn ${activeTab === 'reels' ? 'active' : ''}`} onClick={() => setActiveTab('reels')}>Reels</button>
            </div>

            {displayError && (
                <div className="alert alert-warning alert-dismissible fade show mb-3" role="alert">
                    <strong>{displayError}</strong>
                    <button type="button" className="btn-close" onClick={() => { setInsightsError(null); setMediaError(null); setAudienceError(null); setError(null); }} aria-label="Close"></button>
                </div>
            )}

            {!reelPage && (
                <div className="alert alert-info mb-3">
                    Select a page (e.g. &quot;Doctor Farmer&quot;) from the PAGE filter above to load metrics, audience insights, and top content from Meta.
                </div>
            )}

            {reelPage && loadingAny && (
                <div className="text-muted mb-3"><i className="fas fa-spinner fa-spin me-2"></i>Loading live Meta data…</div>
            )}

            {/* --- WRAPPER FOR ANIMATED CONTENT --- */}
            <div key={activeTab} className={animClass}>

                {/* --- SUMMARY METRICS (live when page selected) --- */}
                <div className="summary-metrics-row">
                    <div className="summary-metric-item">
                        <div className="summary-label">Views <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">
                            {hasLiveData ? formatCount(totalViewsLive) : (totals.views / 1000).toFixed(1) + 'k'}
                            {!hasLiveData && <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 4.3%</span>}
                        </div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Reach <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">
                            {hasLiveData ? formatCount(totalReachLive) : '4M'}
                            {!hasLiveData && <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 11.6%</span>}
                        </div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Content interactions <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">
                            {hasLiveData ? formatCount(totalInteractionsLive) : (totals.shares + totals.likes + totals.comments)}
                            {!hasLiveData && <span className="summary-trend trend-down"><i className="fas fa-arrow-down"></i> 29.2%</span>}
                        </div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Hook Rate <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">
                            {hasLiveData && avgHookRateLive != null ? `${avgHookRateLive}%` : '42.5%'}
                            {!hasLiveData && <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 5.1%</span>}
                        </div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Content Win Rate <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">
                            {hasLiveData ? `${contentWinRateLive}%` : '68%'}
                            {!hasLiveData && <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 8.2%</span>}
                        </div>
                    </div>
                </div>

                {/* --- KPI CARDS ROW (live audience + watch time + engagement rate) --- */}
                <div className="kpi-row">
                    <motion.button
                        className={`kpi-card-reel bg-blue-dark ${activeChart === 'watchTime' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'watchTime' ? null : 'watchTime')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Watch Time</div>
                        <div className="value">{hasLiveData ? watchTimeDisplay : (totals.watch / 1000).toFixed(0)}<span className="val-suffix">{hasLiveData ? '' : 'K'}</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-purple-dark ${activeChart === 'age' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'age' ? null : 'age')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Age</div>
                        <div className="value">{hasLiveData ? ageBreakdown.length : 5}<span className="val-suffix">Groups</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-pink ${activeChart === 'gender' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'gender' ? null : 'gender')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Gender</div>
                        <div className="value">{hasLiveData ? genderBreakdown.length : 3}<span className="val-suffix">Groups</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-purple-light ${activeChart === 'location' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'location' ? null : 'location')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Location</div>
                        <div className="value">{hasLiveData ? locationBreakdown.length : 6}<span className="val-suffix">Regions</span></div>
                    </motion.button>
                    <div className="kpi-card-reel bg-teal">
                        <div className="label">Engagement rate</div>
                        <div className="value">{hasLiveData ? engagementRateLive.toFixed(2) : '1.62'}<span className="val-suffix">%</span></div>
                    </div>
                </div>

                {/* --- DYNAMIC CHARTS SECTION --- */}
                <AnimatePresence mode="wait">
                    {activeChart && (
                        <motion.div
                            initial={{ opacity: 0, y: 20, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -20, scale: 0.95 }}
                            transition={{ 
                                type: "spring", 
                                stiffness: 300, 
                                damping: 25,
                                duration: 0.5
                            }}
                            className="chart-panel"
                            style={{ marginTop: '24px', marginBottom: '24px' }}
                        >
                            {activeChart === 'watchTime' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="chart-header-row">
                                        <div className="chart-legend-custom">
                                            <div className="fw-bold">Watch Time Distribution</div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={watchTimeChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationBegin={0} animationDuration={800}>
                                                    {watchTimeChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </motion.div>
                            )}

                            {activeChart === 'age' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="chart-header-row">
                                        <div className="chart-legend-custom">
                                            <div className="fw-bold">Age Distribution</div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={ageChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="age" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationBegin={0} animationDuration={800}>
                                                    {ageChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </motion.div>
                            )}

                            {activeChart === 'gender' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="chart-header-row">
                                        <div className="chart-legend-custom">
                                            <div className="fw-bold">Gender Distribution</div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={genderChartData}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                    outerRadius={100}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                    animationBegin={0}
                                                    animationDuration={800}
                                                >
                                                    {genderChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </motion.div>
                            )}

                            {activeChart === 'location' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="chart-header-row">
                                        <div className="chart-legend-custom">
                                            <div className="fw-bold">Location Distribution</div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ComposedChart data={locationChartData} layout="vertical">
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis dataKey="location" type="category" width={120} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[0, 8, 8, 0]} animationBegin={0} animationDuration={800}>
                                                    {locationChartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                                    ))}
                                                </Bar>
                                            </ComposedChart>
                                        </ResponsiveContainer>
                                    </div>
                                </motion.div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* --- CHARTS ROW --- */}
                <div className="main-grid" style={{ marginBottom: '24px' }}>
                    <div className="chart-panel">
                        <div className="chart-header-row">
                            <div className="chart-legend-custom">
                                <div><span className="legend-dot" style={{ background: '#0369a1' }}></span> Views</div>
                                <div><span className="legend-dot" style={{ background: '#38bdf8' }}></span> Engagements</div>
                            </div>
                            <i className="fas fa-ellipsis-h text-muted"></i>
                        </div>
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={viewsData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval={6} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 4000]} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                                    <Tooltip />
                                    <Bar yAxisId="left" dataKey="views" fill="#0369a1" barSize={8} radius={[2, 2, 0, 0]} />
                                    <Line yAxisId="right" type="monotone" dataKey="eng" stroke="#38bdf8" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="chart-panel">
                        <div className="chart-header-row"><div className="chart-legend-custom"><div>Subscribers change</div></div></div>
                        <div style={{ width: '100%', height: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={subData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval={6} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} domain={[0, 25]} />
                                    <Tooltip />
                                    <Line type="monotone" dataKey="val" stroke="#0369a1" strokeWidth={2} dot={false} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* --- TOP CONTENT BY VIEWS (card carousel) --- */}
                <div className="top-content-by-views">
                    <div className="top-content-by-views-header">
                        <span className="top-content-by-views-icon">
                            <i className="fab fa-instagram" aria-hidden></i>
                        </span>
                        <h3 className="top-content-by-views-title">Top content by views</h3>
                    </div>
                    <div className="top-content-by-views-carousel-wrap">
                        <div
                            className="top-content-cards-scroll"
                            ref={topContentScrollRef}
                            role="list"
                        >
                            {contentListForTopContent.map((item, idx) => (
                                <article key={item.id || idx} className="top-content-card" role="listitem">
                                    <div className="top-content-card-thumb" style={{ backgroundColor: item.imgColor || COLORS[idx % COLORS.length] }}>
                                        <span className="top-content-card-play" aria-hidden>
                                            <i className="fas fa-play"></i>
                                        </span>
                                    </div>
                                    <h4 className="top-content-card-title" title={item.title}>
                                        {(item.title || '').length > 35 ? `${(item.title || '').slice(0, 35)}...` : (item.title || 'Reel')}
                                    </h4>
                                    <p className="top-content-card-date">{getPublishDate(item)}</p>
                                    <div className="top-content-card-metrics">
                                        <div className="top-content-metric">
                                            <i className="far fa-eye" aria-hidden></i>
                                            <span>{formatCount(item.views || 0)}</span>
                                        </div>
                                        <div className="top-content-metric">
                                            <i className="far fa-comment" aria-hidden></i>
                                            <span>{formatCount(item.comments || 0)}</span>
                                        </div>
                                        <div className="top-content-metric">
                                            <i className="far fa-heart" aria-hidden></i>
                                            <span>{formatCount(item.likes || 0)}</span>
                                        </div>
                                        <div className="top-content-metric">
                                            <i className="fas fa-share-alt" aria-hidden></i>
                                            <span>{formatCount(item.shares != null ? item.shares : 0)}</span>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                        <button
                            type="button"
                            className="top-content-scroll-btn"
                            onClick={scrollTopContent}
                            aria-label="Scroll to see more content"
                        >
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>

            </div>

            <DateRangeFilter
                isOpen={showContentDateRangeFilter}
                onClose={() => setShowContentDateRangeFilter(false)}
                onApply={handleContentDateRangeApply}
                initialValue={contentDateRangeFilterValue || {
                    range_type: contentDateRange,
                    start_date: contentFilters.startDate || null,
                    end_date: contentFilters.endDate || null,
                    timezone: 'Asia/Kolkata',
                    compare: { enabled: false }
                }}
            />
        </div>
    );
}
