import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './BestPerformingReel.css';
import {
    ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
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

// Fetch campaigns from Meta API (same as Dashboards.jsx)
const fetchCampaigns = async () => {
    try {
        const token = getAuthToken();
        const headers = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const res = await fetch(`${API_BASE}/api/meta/active-campaigns`, { headers });
        const data = await res.json();
        console.log("Fetched campaigns:", data);
        
        // Return full objects or empty array
        if (Array.isArray(data)) {
            return data;
        } else if (data && Array.isArray(data.data)) {
            return data.data;
        }
        return [];
    } catch (e) {
        console.error("Error fetching campaigns:", e);
        return [];
    }
};

export default function BestPerformingReel() {
    // --- FILTER STATE & LOGIC ---
    const [filters, setFilters] = useState({ startDate: '', endDate: '' });
    const [selectedDateRange, setSelectedDateRange] = useState('27/10/2025 - 28/11/2025');
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'posts', 'stories'
    const [selectedPlatform, setSelectedPlatform] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [activeChart, setActiveChart] = useState(null); // 'contentType', 'watchTime', 'age', 'gender', 'location'

    // Load campaigns from Meta API on component mount
    useEffect(() => {
        const loadCampaigns = async () => {
            setLoading(true);
            try {
                const campaignData = await fetchCampaigns();
                setCampaigns(campaignData);
                if (campaignData.length === 0) {
                    setError("No campaigns found. Please configure Meta credentials in Settings.");
                }
            } catch (e) {
                console.error("Failed to load campaigns:", e);
                setError("Failed to load campaigns. Please check your Meta credentials.");
            } finally {
                setLoading(false);
            }
        };
        loadCampaigns();
    }, []);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const applyPreset = (type) => {
        const today = new Date();
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(today.setDate(diff));
        const sunday = new Date(today.setDate(diff + 6));

        let start = new Date(monday);
        let end = new Date(sunday);

        if (type === 'last_week') {
            start.setDate(start.getDate() - 7);
            end.setDate(end.getDate() - 7);
            setSelectedDateRange('Last Week');
        } else if (type === 'next_week') {
            start.setDate(start.getDate() + 7);
            end.setDate(end.getDate() + 7);
            setSelectedDateRange('Next Week');
        } else {
            setSelectedDateRange('This Week');
        }

        setFilters({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        });
    };

    // --- MOCK DATA ---

    // 1. Chart Data (Views vs Engagements)
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
    const contentTypeData = [
        { name: 'Video', value: 45, color: '#0369a1' },
        { name: 'Post', value: 30, color: '#38bdf8' },
        { name: 'Story', value: 15, color: '#0ea5e9' },
        { name: 'Reel', value: 10, color: '#60a5fa' },
    ];

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
    }

    const totals = calculateTotals(currentList);

    return (
        <div className="best-reel-container">
            {/* Error Message */}
            {error && (
                <div className="alert alert-warning alert-dismissible fade show mb-3" role="alert">
                    <strong>⚠️ {error}</strong>
                    <br />
                    <small>
                        Please configure your Meta API credentials in{" "}
                        <a href="/meta-settings" className="alert-link">
                            Meta Settings
                        </a>{" "}
                        to view your campaign data.
                    </small>
                    <button
                        type="button"
                        className="btn-close"
                        onClick={() => setError(null)}
                        aria-label="Close"
                    ></button>
                </div>
            )}

            {/* --- TOP FILTERS --- */}
            <div className="filters-row">
                <div className="filter-box">
                    <label className="filter-label">Platform</label>
                    <select 
                        className="filter-select"
                        value={selectedPlatform}
                        onChange={(e) => setSelectedPlatform(e.target.value)}
                        style={{ 
                            border: 'none', 
                            background: 'transparent', 
                            width: '100%',
                            fontWeight: '500',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">All</option>
                        <option value="facebook">Facebook</option>
                        <option value="instagram">Instagram</option>
                        <option value="youtube">YouTube</option>
                        <option value="tiktok">TikTok</option>
                        <option value="twitter">Twitter</option>
                        <option value="linkedin">LinkedIn</option>
                    </select>
                </div>
                <div className="filter-box">
                    <label className="filter-label">Campaign</label>
                    <select 
                        className="filter-select"
                        value={selectedCampaign}
                        onChange={(e) => setSelectedCampaign(e.target.value)}
                        disabled={loading}
                        style={{ 
                            border: 'none', 
                            background: 'transparent', 
                            width: '100%',
                            fontWeight: '500',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1
                        }}
                    >
                        <option value="">All Campaigns</option>
                        {campaigns.map((campaign) => (
                            <option key={campaign.id} value={campaign.id}>
                                {campaign.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="filter-box">
                    <label className="filter-label">Content type</label>
                    <div className="d-flex justify-content-between align-items-center">
                        <span className="fw-medium">All</span>
                        <i className="fas fa-chevron-down text-secondary small"></i>
                    </div>
                </div>
                {/* DATE DROPDOWN FILTER */}
                <div style={{ flex: 1.5, minWidth: '300px' }}>
                    <label className="filter-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Report date</label>
                    <div className="dropdown">
                        <div className="d-flex align-items-center gap-2 px-3 py-2 bg-white border shadow-sm dropdown-toggle cursor-pointer" role="button" data-bs-toggle="dropdown" aria-expanded="false" style={{ borderRadius: '8px', color: '#64748b', borderColor: '#cbd5e1', transition: 'all 0.2s ease', width: '100%', backgroundColor: 'white' }} onMouseEnter={(e) => e.currentTarget.style.borderColor = '#94a3b8'} onMouseLeave={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}>
                            <i className="far fa-calendar-alt text-secondary opacity-75"></i>
                            <span className="fw-medium small text-dark flex-grow-1 text-center" style={{ fontSize: '0.9rem' }}>{selectedDateRange.includes(':') ? selectedDateRange : `${filters.startDate ? 'Custom' : ''} ${selectedDateRange}`}</span>
                            <i className="fas fa-chevron-down text-secondary opacity-50 small"></i>
                        </div>
                        <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-3 mt-2" style={{ minWidth: '340px', backgroundColor: '#ffffff' }}>
                            <div className="mb-3">
                                <h6 className="dropdown-header text-uppercase x-small fw-bold text-muted ls-1 ps-0 mb-2" style={{ fontSize: '0.7rem' }}>Quick Select</h6>
                                <div className="d-flex gap-2">
                                    <button onClick={() => applyPreset('last_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Last Week</button>
                                    <button onClick={() => applyPreset('this_week')} className="btn btn-sm btn-outline-primary bg-primary-subtle text-primary border-primary flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>This Week</button>
                                    <button onClick={() => applyPreset('next_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Next Week</button>
                                </div>
                            </div>
                            <div className="dropdown-divider my-3 opacity-10"></div>
                            <div>
                                <h6 className="dropdown-header text-uppercase x-small fw-bold text-muted ls-1 ps-0 mb-2" style={{ fontSize: '0.7rem' }}>Custom Range</h6>
                                <div className="d-flex flex-column gap-2">
                                    <div className="d-flex align-items-center gap-2">
                                        <div className="flex-fill"><label className="form-label x-small text-muted mb-1" style={{ fontSize: '0.7rem' }}>From</label><input type="date" className="form-control form-control-sm border-light bg-light text-secondary fw-medium" name="startDate" value={filters.startDate} onChange={handleFilterChange} /></div>
                                        <div className="pt-3 text-muted opacity-50"><i className="fas fa-arrow-right small"></i></div>
                                        <div className="flex-fill"><label className="form-label x-small text-muted mb-1" style={{ fontSize: '0.7rem' }}>To</label><input type="date" className="form-control form-control-sm border-light bg-light text-secondary fw-medium" name="endDate" value={filters.endDate} onChange={handleFilterChange} /></div>
                                    </div>
                                    <button className="btn btn-primary w-100 btn-sm rounded-2 fw-bold mt-2 shadow-sm" onClick={() => { const startDisplay = filters.startDate ? new Date(filters.startDate).toLocaleDateString('en-GB') : '...'; const endDisplay = filters.endDate ? new Date(filters.endDate).toLocaleDateString('en-GB') : '...'; setSelectedDateRange(`Custom: ${startDisplay} - ${endDisplay}`); }}>Apply Range</button>
                                </div>
                            </div>
                        </ul>
                    </div>
                </div>
            </div>

            {/* --- NAVIGATION TABS --- */}
            <div className="nav-tabs-custom">
                <button className={`nav-tab-btn ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All</button>
                <button className={`nav-tab-btn ${activeTab === 'posts' ? 'active' : ''}`} onClick={() => setActiveTab('posts')}>Posts</button>
                <button className={`nav-tab-btn ${activeTab === 'stories' ? 'active' : ''}`} onClick={() => setActiveTab('stories')}>Stories</button>
            </div>

            {/* --- WRAPPER FOR ANIMATED CONTENT --- */}
            <div key={activeTab} className={animClass}>

                {/* --- SUMMARY METRICS --- */}
                <div className="summary-metrics-row">
                    <div className="summary-metric-item">
                        <div className="summary-label">Views <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">{(totals.views / 1000).toFixed(1)}k <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 4.3%</span></div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Reach <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">4M <span className="summary-trend trend-up"><i className="fas fa-arrow-up"></i> 11.6%</span></div>
                    </div>
                    <div className="summary-metric-item">
                        <div className="summary-label">Content interactions <i className="fas fa-info-circle text-muted small"></i></div>
                        <div className="summary-value">{(totals.shares + totals.likes + totals.comments)} <span className="summary-trend trend-down"><i className="fas fa-arrow-down"></i> 29.2%</span></div>
                    </div>
                </div>

                {/* --- KPI CARDS ROW (Clickable Buttons) --- */}
                <div className="kpi-row">
                    <motion.button
                        className={`kpi-card-reel bg-teal ${activeChart === 'contentType' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'contentType' ? null : 'contentType')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Content Type</div>
                        <div className="value">4<span className="val-suffix">Types</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-blue-dark ${activeChart === 'watchTime' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'watchTime' ? null : 'watchTime')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Watch Time</div>
                        <div className="value">{(totals.watch / 1000).toFixed(0)}<span className="val-suffix">K</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-purple-dark ${activeChart === 'age' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'age' ? null : 'age')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Age</div>
                        <div className="value">5<span className="val-suffix">Groups</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-pink ${activeChart === 'gender' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'gender' ? null : 'gender')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Gender</div>
                        <div className="value">3<span className="val-suffix">Groups</span></div>
                    </motion.button>
                    <motion.button
                        className={`kpi-card-reel bg-purple-light ${activeChart === 'location' ? 'active-chart' : ''}`}
                        onClick={() => setActiveChart(activeChart === 'location' ? null : 'location')}
                        whileHover={{ scale: 1.05, y: -5 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="label">Location</div>
                        <div className="value">6<span className="val-suffix">Regions</span></div>
                    </motion.button>
                    <div className="kpi-card-reel bg-teal"><div className="label">Engagement rate</div><div className="value">1.62<span className="val-suffix">%</span></div></div>
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
                            {activeChart === 'contentType' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                >
                                    <div className="chart-header-row">
                                        <div className="chart-legend-custom">
                                            <div className="fw-bold">Content Type Distribution</div>
                                        </div>
                                    </div>
                                    <div style={{ width: '100%', height: 300 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={contentTypeData}
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
                                                    {contentTypeData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </motion.div>
                            )}

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
                                            <ComposedChart data={watchTimeData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationBegin={0} animationDuration={800}>
                                                    {watchTimeData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
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
                                            <ComposedChart data={ageData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="age" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationBegin={0} animationDuration={800}>
                                                    {ageData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                                                    data={genderData}
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
                                                    {genderData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
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
                                            <ComposedChart data={locationData} layout="vertical">
                                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <YAxis dataKey="location" type="category" width={120} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                                <Tooltip />
                                                <Bar dataKey="value" radius={[0, 8, 8, 0]} animationBegin={0} animationDuration={800}>
                                                    {locationData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
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

                {/* --- FULL WIDTH TABLE --- */}
                <div className="video-list-panel">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                        <div className="fw-bold" style={{ fontSize: '0.9rem' }}>{tableTitle}</div>
                        <i className="fas fa-expand text-muted small"></i>
                    </div>
                    <table className="video-table">
                        <thead>
                            <tr>
                                <th>Media</th>{/* Generic Label */}
                                <th>URL</th>
                                <th>Title</th>
                                <th>Type</th>
                                <th>Views</th>
                                <th>Watch time</th>
                                <th>Likes</th>
                                <th>Shares</th>
                                <th>Comments</th>
                                <th>Engagement rate</th>
                                <th>Avg view %</th>
                                <th>Sub Change</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentList.map(item => (
                                <tr key={item.id}>
                                    <td><div className="video-thumb" style={{ backgroundColor: item.imgColor }}></div></td>
                                    <td><a href={item.url} className="video-link" target="_blank" rel="noopener noreferrer">{item.url}</a></td>
                                    <td><div className="video-title">{item.title}</div></td>
                                    <td>{item.type}</td>
                                    <td className="col-bg-views">{item.views}</td>
                                    <td className="col-bg-watch">{item.watch}</td>
                                    <td className="col-bg-likes">{item.likes}</td>
                                    <td className="col-bg-shares">{item.shares}</td>
                                    <td className="col-bg-comments">{item.comments}</td>
                                    <td>{item.rate}</td>
                                    <td>{item.avgView}</td>
                                    <td className="col-bg-subs">{item.subChange}</td>
                                </tr>
                            ))}
                            <tr className="total-row">
                                <td colSpan="4">Total</td>
                                <td>{totals.views}</td>
                                <td>{totals.watch}</td>
                                <td>{totals.likes}</td>
                                <td>{totals.shares}</td>
                                <td>{totals.comments}</td>
                                <td>-</td>
                                <td>-</td>
                                <td>{totals.subChange}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            </div>
        </div>
    );
}
