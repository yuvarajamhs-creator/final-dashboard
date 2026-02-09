import React, { useState, useEffect, useMemo } from 'react';
import './BestPerformingAd.css';
import {
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Bar, Line, ComposedChart, Legend,
    FunnelChart, Funnel, LabelList
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

// USD to INR conversion rate (update as needed)
const USD_TO_INR = 83;

// Helper to transform Meta "actions" array -> object map
const transformActions = (actions = []) => {
    if (!Array.isArray(actions)) return {};
    const map = {};
    actions.forEach((a) => {
        map[a.action_type] = Number(a.value);
    });
    return map;
};

// Helper: safe number
const num = (v) => Number(v) || 0;

// Format currency in INR
const formatINR = (value) => {
    return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Format number with Indian locale
const formatNum = (value) => {
    return value.toLocaleString('en-IN');
};

// Format percentage
const formatPerc = (value) => {
    return `${value.toFixed(2)}%`;
};

// Fetch insights from Meta API
const fetchInsightsData = async ({ campaignId = '', adId = '', startDate = '', endDate = '' }) => {
    try {
        const token = getAuthToken();
        const headers = { "Content-Type": "application/json" };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        // Calculate days from date range or use default
        let days = 30;
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = Math.abs(end - start);
            days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }

        let url = `${API_BASE}/api/meta/insights?time_increment=1&days=${days}`;
        if (campaignId) {
            url += `&campaign_id=${campaignId}`;
        }
        if (adId) {
            url += `&ad_id=${adId}`;
        }

        const res = await fetch(url, { headers });

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error("API error:", errorData);
            throw new Error(errorData.details || errorData.error || res.statusText || "Failed to fetch insights");
        }

        let data = await res.json();

        // Handle { data: [...] } structure from Meta API
        if (data && !Array.isArray(data) && Array.isArray(data.data)) {
            data = data.data;
        }

        if (!Array.isArray(data)) {
            console.error("API returned non-array:", data);
            return [];
        }

        // Normalize data
        return data.map((d) => {
            const aggs = transformActions(d.actions || []);
            const values = transformActions(d.action_values || []);
            const leadCount = aggs['lead'] || aggs['on_facebook_lead'] || aggs['onsite_conversion.lead_grouped'] || 0;
            const conversions = aggs['purchase'] || aggs['complete_registration'] || aggs['offsite_conversion.fb_pixel_purchase'] || 0;
            
            const impressions = num(d.impressions);
            const clicks = num(d.clicks);
            const spend = num(d.spend);
            const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
            const cpl = leadCount > 0 ? spend / leadCount : 0;
            const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
            const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

            return {
                campaign_id: d.campaign_id,
                campaign: d.campaign_name || "Unknown Campaign",
                ad_id: d.ad_id || null,
                ad_name: d.ad_name || "Unnamed Ad",
                date: d.date_start || d.date,
                spend: spend,
                impressions: impressions,
                clicks: clicks,
                leads: leadCount,
                conversions: conversions,
                ctr: ctr,
                cpl: cpl,
                cpm: cpm,
                conversionRate: conversionRate,
                actions: aggs,
                action_values: values
            };
        });
    } catch (e) {
        console.error("Failed to fetch insights data", e);
        return [];
    }
};

export default function BestPerformingAd() {

    // Helper for table heatmap styles (simple version)
    // Note: val should be in INR for spend and cpl
    const getBgClass = (val, type) => {
        if (type === 'spend' && val > 200 * USD_TO_INR) return 'cell-heatmap-mid';
        if (type === 'leadGenerated' && val > 300) return 'cell-heatmap-high';
        if (type === 'conversionCount' && val > 800) return 'cell-heatmap-high';
        if (type === 'conversionRate' && val > 3.0) return 'cell-heatmap-high';
        if (type === 'cpl' && val > 0.65 * USD_TO_INR) return 'cell-heatmap-low';
        return '';
    };

    // --- FILTER STATE & LOGIC ---
    const [filters, setFilters] = useState({ startDate: '', endDate: '' });
    const [selectedDateRange, setSelectedDateRange] = useState('this_week');
    const [selectedProject, setSelectedProject] = useState('');
    const [insightsData, setInsightsData] = useState([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch insights data when date range changes
    useEffect(() => {
        const loadInsights = async () => {
            setDataLoading(true);
            setError(null);
            try {
                const data = await fetchInsightsData({
                    startDate: filters.startDate,
                    endDate: filters.endDate
                });
                setInsightsData(data);
            } catch (e) {
                console.error("Failed to load insights:", e);
                setError(e.message || "Failed to load insights data.");
            } finally {
                setDataLoading(false);
            }
        };
        loadInsights();
    }, [filters.startDate, filters.endDate]);

    // Calculate totals from insights data
    const totals = useMemo(() => {
        const t = {
            spend: 0,
            impressions: 0,
            clicks: 0,
            leads: 0,
            conversions: 0
        };
        
        insightsData.forEach((r) => {
            t.spend += r.spend || 0;
            t.impressions += r.impressions || 0;
            t.clicks += r.clicks || 0;
            t.leads += r.leads || 0;
            t.conversions += r.conversions || 0;
        });

        // Calculate derived metrics
        t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
        t.cpl = t.leads > 0 ? t.spend / t.leads : 0;
        t.conversionRate = t.clicks > 0 ? (t.conversions / t.clicks) * 100 : 0;

        // Convert to INR
        t.spendINR = t.spend * USD_TO_INR;
        t.cpmINR = t.cpm * USD_TO_INR;
        t.cplINR = t.cpl * USD_TO_INR;

        return t;
    }, [insightsData]);

    // Funnel data from live insights
    const funnelData = useMemo(() => [
        { value: totals.impressions, name: 'Impressions', fill: '#4338ca' },
        { value: totals.clicks, name: 'Clicks', fill: '#0ea5e9' },
        { value: totals.leads, name: 'Leads', fill: '#06b6d4' }
    ], [totals]);

    // Aggregate data by date for charts
    const aggregateByDate = useMemo(() => {
        const dateMap = {};
        insightsData.forEach((r) => {
            const dateKey = r.date || '';
            if (!dateKey) return;
            
            if (!dateMap[dateKey]) {
                dateMap[dateKey] = {
                    date: dateKey,
                    spend: 0,
                    impressions: 0,
                    clicks: 0,
                    leads: 0,
                    conversions: 0
                };
            }
            
            dateMap[dateKey].spend += r.spend || 0;
            dateMap[dateKey].impressions += r.impressions || 0;
            dateMap[dateKey].clicks += r.clicks || 0;
            dateMap[dateKey].leads += r.leads || 0;
            dateMap[dateKey].conversions += r.conversions || 0;
        });
        
        return Object.values(dateMap).sort((a, b) => new Date(a.date) - new Date(b.date));
    }, [insightsData]);

    // Dynamics Data (Amount Spend vs Lead Generated from Ad)
    const dynamicsData = useMemo(() => {
        return aggregateByDate.map((d) => {
            const date = new Date(d.date);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return {
                date: formattedDate,
                spend: d.spend * USD_TO_INR, // Convert to INR
                leadGenerated: d.leads
            };
        });
    }, [aggregateByDate]);

    // Impressions & CPM Data
    const impressionsData = useMemo(() => {
        return aggregateByDate.map((d) => {
            const date = new Date(d.date);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const cpm = d.impressions > 0 ? (d.spend / d.impressions) * 1000 : 0;
            return {
                day: formattedDate,
                imp: d.impressions,
                cpm: cpm * USD_TO_INR // Convert to INR
            };
        });
    }, [aggregateByDate]);

    // Link clicks & Conversion Rate Data
    const clicksData = useMemo(() => {
        return aggregateByDate.map((d) => {
            const date = new Date(d.date);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const conversionRate = d.clicks > 0 ? (d.conversions / d.clicks) * 100 : 0;
            return {
                day: formattedDate,
                clicks: d.clicks,
                conversionRate: conversionRate
            };
        });
    }, [aggregateByDate]);

    // Leads & CPL Data
    const leadsData = useMemo(() => {
        return aggregateByDate.map((d) => {
            const date = new Date(d.date);
            const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const cpl = d.leads > 0 ? d.spend / d.leads : 0;
            return {
                day: formattedDate,
                leads: d.leads,
                cpl: cpl * USD_TO_INR // Convert to INR
            };
        });
    }, [aggregateByDate]);

    // Aggregate data by campaign and ad for table
    const campaignData = useMemo(() => {
        const campaignMap = {};
        
        insightsData.forEach((r) => {
            // Use campaign_id and ad_id as key, or campaign name and ad name
            const key = `${r.campaign_id || r.campaign}_${r.ad_id || r.ad_name || 'no_ad'}`;
            
            if (!campaignMap[key]) {
                campaignMap[key] = {
                    id: key,
                    campaign_id: r.campaign_id,
                    ad_id: r.ad_id,
                    name: r.campaign || 'Unknown Campaign',
                    adset: r.ad_name || 'Unnamed Ad',
                    spend: 0,
                    impressions: 0,
                    clicks: 0,
                    leads: 0,
                    conversions: 0
                };
            }
            
            campaignMap[key].spend += r.spend || 0;
            campaignMap[key].impressions += r.impressions || 0;
            campaignMap[key].clicks += r.clicks || 0;
            campaignMap[key].leads += r.leads || 0;
            campaignMap[key].conversions += r.conversions || 0;
        });
        
        // Calculate derived metrics and convert to INR
        return Object.values(campaignMap).map((item) => {
            const ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0;
            const cpm = item.impressions > 0 ? (item.spend / item.impressions) * 1000 : 0;
            const cpl = item.leads > 0 ? item.spend / item.leads : 0;
            const conversionRate = item.clicks > 0 ? (item.conversions / item.clicks) * 100 : 0;
            
            return {
                ...item,
                ctr: ctr,
                cpm: cpm * USD_TO_INR, // Convert to INR
                cpl: cpl * USD_TO_INR, // Convert to INR
                conversionRate: conversionRate
            };
        }).sort((a, b) => b.spend - a.spend); // Sort by spend descending
    }, [insightsData]);

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const applyPreset = (type) => {
        const today = new Date();
        // Simple logic for demo:
        // This Week: Monday to Sunday
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

    return (
        <div className="best-ad-container">
            {/* Error Message */}
            {error && (
                <div className="alert alert-warning alert-dismissible fade show mb-3" role="alert">
                    <strong>⚠️ {error}</strong>
                    <br />
                    <small>
                        Please configure your Meta API credentials (META_ACCESS_TOKEN, META_AD_ACCOUNT_ID) in server/.env file to view your ad data.
                    </small>
                    <button
                        type="button"
                        className="btn-close"
                        onClick={() => setError(null)}
                        aria-label="Close"
                    ></button>
                </div>
            )}

            {/* --- FILTERS ROW --- */}
            <div className="filters-bar">
                {/* REPLACED DATE FILTER */}
                <div className="dropdown" style={{ flex: 1 }}>
                    <div
                        className="d-flex align-items-center gap-2 px-3 py-2 bg-white border shadow-sm dropdown-toggle cursor-pointer"
                        role="button"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                        style={{
                            borderRadius: '6px',
                            color: '#64748b',
                            borderColor: '#cbd5e1',
                            transition: 'all 0.2s ease',
                            height: '42px'
                        }}
                    >
                        <i className="far fa-calendar-alt text-secondary opacity-75"></i>
                        <span className="fw-medium small text-dark flex-grow-1 text-center" style={{ fontSize: '0.9rem' }}>
                            {selectedDateRange.includes('Week') ? selectedDateRange : `${filters.startDate ? 'Custom' : 'Select Date'}: ${selectedDateRange}`}
                        </span>
                        <i className="fas fa-chevron-down text-secondary opacity-50 small"></i>
                    </div>

                    {/* Dropdown Content */}
                    <ul className="dropdown-menu shadow-lg border-0 rounded-3 p-3 mt-2" style={{ minWidth: '340px', backgroundColor: '#ffffff' }}>

                        {/* Presets Section */}
                        <div className="mb-3">
                            <h6 className="dropdown-header text-uppercase x-small fw-bold text-muted ls-1 ps-0 mb-2" style={{ fontSize: '0.7rem' }}>Quick Select</h6>
                            <div className="d-flex gap-2">
                                <button onClick={() => applyPreset('last_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Last Week</button>
                                <button onClick={() => applyPreset('this_week')} className="btn btn-sm btn-outline-primary bg-primary-subtle text-primary border-primary flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>This Week</button>
                                <button onClick={() => applyPreset('next_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Next Week</button>
                            </div>
                        </div>

                        <div className="dropdown-divider my-3 opacity-10"></div>

                        {/* Custom Range Section */}
                        <div>
                            <h6 className="dropdown-header text-uppercase x-small fw-bold text-muted ls-1 ps-0 mb-2" style={{ fontSize: '0.7rem' }}>Custom Range</h6>
                            <div className="d-flex flex-column gap-2">
                                <div className="d-flex align-items-center gap-2">
                                    <div className="flex-fill">
                                        <label className="form-label x-small text-muted mb-1" style={{ fontSize: '0.7rem' }}>From</label>
                                        <input
                                            type="date"
                                            className="form-control form-control-sm border-light bg-light text-secondary fw-medium"
                                            name="startDate"
                                            value={filters.startDate}
                                            onChange={handleFilterChange}
                                        />
                                    </div>
                                    <div className="pt-3 text-muted opacity-50"><i className="fas fa-arrow-right small"></i></div>
                                    <div className="flex-fill">
                                        <label className="form-label x-small text-muted mb-1" style={{ fontSize: '0.7rem' }}>To</label>
                                        <input
                                            type="date"
                                            className="form-control form-control-sm border-light bg-light text-secondary fw-medium"
                                            name="endDate"
                                            value={filters.endDate}
                                            onChange={handleFilterChange}
                                        />
                                    </div>
                                </div>

                                <button
                                    className="btn btn-primary w-100 btn-sm rounded-2 fw-bold mt-2 shadow-sm"
                                    onClick={() => {
                                        const startDisplay = filters.startDate ? new Date(filters.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...';
                                        const endDisplay = filters.endDate ? new Date(filters.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...';
                                        setSelectedDateRange(`${startDisplay} - ${endDisplay}`);
                                    }}
                                >
                                    Apply Range
                                </button>
                            </div>
                        </div>
                    </ul>
                </div>
                <div className="custom-select-wrapper">
                    <select
                        className="filter-select"
                        value={selectedProject}
                        onChange={(e) => setSelectedProject(e.target.value)}
                    >
                        <option value="">All Projects</option>
                        <option value="Free Webinar">Free Webinar</option>
                        <option value="Paid Webinar">Paid Webinar</option>
                        <option value="Dental Care">Dental Care</option>
                        <option value="Physio Care">Physio Care</option>
                        <option value="Direct Walkin">Direct Walkin</option>
                        <option value="Youtube">Youtube</option>
                    </select>
                </div>
            </div>

            {/* --- KPI CARDS ROW --- */}
            <div className="kpi-grid">
                {/* 1. Amount Spent (White with Purple Border) */}
                <div className="kpi-card-new kpi-white">
                    <div className="kpi-title">Amount spent</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatINR(totals.spendINR)}
                    </div>
                </div>

                {/* 2. CPM (Dark Blue) */}
                <div className="kpi-card-new kpi-blue-dark">
                    <div className="kpi-title">CPM</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatINR(totals.cpmINR)}
                    </div>
                    <div className="kpi-trend">
                        <i className="fas fa-arrow-up"></i> {dataLoading ? '...' : '38.7%'}
                    </div>
                </div>

                {/* 3. Conversion Count (Light Blue) */}
                <div className="kpi-card-new kpi-blue-light">
                    <div className="kpi-title">Conversion Count</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatNum(totals.conversions)}
                    </div>
                    <div className="kpi-trend">
                        <i className="fas fa-arrow-up"></i> {dataLoading ? '...' : '18.5%'}
                    </div>
                </div>

                {/* 4. Lead Generated from Ad (Teal Green) */}
                <div className="kpi-card-new kpi-green">
                    <div className="kpi-title">Lead Generated from Ad</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatNum(totals.leads)}
                    </div>
                    <div className="kpi-trend">
                        <i className="fas fa-arrow-up"></i> {dataLoading ? '...' : '12.3%'}
                    </div>
                </div>

                {/* 5. CPL (Red) */}
                <div className="kpi-card-new kpi-red">
                    <div className="kpi-title">CPL</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatINR(totals.cplINR)}
                    </div>
                    <div className="kpi-trend">
                        <i className="fas fa-arrow-down"></i> {dataLoading ? '...' : '-7.0%'}
                    </div>
                </div>

                {/* 6. Conversion Rate (Purple) */}
                <div className="kpi-card-new kpi-purple">
                    <div className="kpi-title">Conversion Rate</div>
                    <div className="kpi-value-lg">
                        {dataLoading ? 'Loading...' : formatPerc(totals.conversionRate)}
                    </div>
                    <div className="kpi-trend">
                        <i className="fas fa-arrow-up"></i> {dataLoading ? '...' : '5.2%'}
                    </div>
                </div>
            </div>

            {/* --- MIDDLE SECTION: FUNNEL & LINE CHART --- */}
            <div className="middle-section">

                {/* FUNNEL CHART */}
                <div className="chart-box">
                    <div className="chart-header">
                        <div className="chart-title-text">Performance Funnel</div>
                        <i className="fas fa-ellipsis-v text-muted" style={{ cursor: 'pointer' }}></i>
                    </div>
                    <div style={{ width: '100%', height: 300, display: 'flex', justifyContent: 'center' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <FunnelChart>
                                <Tooltip />
                                <Funnel
                                    dataKey="value"
                                    data={funnelData}
                                    isAnimationActive
                                >
                                    <LabelList position="right" fill="#000" stroke="none" dataKey="name" />
                                    <LabelList position="center" fill="#fff" stroke="none" dataKey="value" formatter={(val) => val.toLocaleString()} />
                                </Funnel>
                            </FunnelChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* DYNAMICS CHART */}
                <div className="chart-box">
                    <div className="chart-header">
                        <div className="chart-title-text">Amount spend & Lead Generated from Ad dynamics</div>
                        <div className="d-flex text-muted gap-3">
                            <i className="fas fa-arrow-up"></i>
                            <i className="fas fa-arrow-down"></i>
                            <i className="fas fa-filter"></i>
                            <i className="fas fa-ellipsis-v"></i>
                        </div>
                    </div>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={dynamicsData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
                                    formatter={(value, name) => {
                                        if (name === 'Amount spend') {
                                            return formatINR(value);
                                        }
                                        return value;
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                <Line yAxisId="left" type="monotone" dataKey="spend" name="Amount spend (INR)" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
                                <Line yAxisId="right" type="monotone" dataKey="leadGenerated" name="Lead Generated from Ad" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- BOTTOM CHARTS ROW (3 Charts) --- */}
            <div className="bottom-charts-grid">
                {/* 1. Impressions & CPM */}
                <div className="chart-box">
                    <div className="chart-header"><div className="chart-title-text">Impressions & CPM</div></div>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={impressionsData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" hide />
                                <YAxis yAxisId="right" orientation="right" hide />
                                <Tooltip 
                                    formatter={(value, name) => {
                                        if (name === 'CPM') {
                                            return formatINR(value);
                                        }
                                        return formatNum(value);
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                <Bar yAxisId="left" dataKey="imp" name="Impressions" fill="#60a5fa" radius={[2, 2, 0, 0]} barSize={10} />
                                <Line yAxisId="right" type="monotone" dataKey="cpm" name="CPM (INR)" stroke="#f43f5e" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Link clicks & Conversion Rate */}
                <div className="chart-box">
                    <div className="chart-header"><div className="chart-title-text">Link clicks & Conversion Rate</div></div>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={clicksData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" hide />
                                <YAxis yAxisId="right" orientation="right" hide />
                                <Tooltip 
                                    formatter={(value, name) => {
                                        if (name === 'Conversion Rate') {
                                            return formatPerc(value);
                                        }
                                        return formatNum(value);
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                <Bar yAxisId="left" dataKey="clicks" name="Link clicks" fill="#4ade80" radius={[2, 2, 0, 0]} barSize={10} />
                                <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conversion Rate" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 3. Leads & CPL */}
                <div className="chart-box">
                    <div className="chart-header"><div className="chart-title-text">Leads & CPL</div></div>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={leadsData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                                <YAxis yAxisId="left" hide />
                                <YAxis yAxisId="right" orientation="right" hide />
                                <Tooltip 
                                    formatter={(value, name) => {
                                        if (name === 'CPL') {
                                            return formatINR(value);
                                        }
                                        return formatNum(value);
                                    }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                                <Bar yAxisId="left" dataKey="leads" name="Leads" fill="#5b45b0" radius={[2, 2, 0, 0]} barSize={10} />
                                <Line yAxisId="right" type="monotone" dataKey="cpl" name="CPL (INR)" stroke="#10b981" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- TABLE SECTION --- */}
            <div className="table-container">
                <div className="chart-header mb-3">
                    <div className="chart-title-text">Campaign performance</div>
                </div>
                <table className="performance-table">
                    <thead>
                        <tr>
                            <th>Campaign name</th>
                            <th>Ad set name</th>
                            <th>Amount spend</th>
                            <th>Impressions</th>
                            <th>Link clicks</th>
                            <th>CTR</th>
                            <th>CPM</th>
                            <th>Conversion Count</th>
                            <th>Lead Generated from Ad</th>
                            <th>CPL</th>
                            <th>Conversion Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dataLoading ? (
                            <tr>
                                <td colSpan="11" className="text-center py-4">
                                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <span className="ms-2">Loading campaign data...</span>
                                </td>
                            </tr>
                        ) : campaignData.length === 0 ? (
                            <tr>
                                <td colSpan="11" className="text-center py-4 text-muted">
                                    No campaign data available. Please select filters or check your Meta API connection.
                                </td>
                            </tr>
                        ) : (
                            campaignData.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.name}</td>
                                    <td>{row.adset}</td>
                                    <td className={getBgClass(row.spend * USD_TO_INR, 'spend')}>
                                        {formatINR(row.spend * USD_TO_INR)}
                                    </td>
                                    <td>{formatNum(row.impressions)}</td>
                                    <td>{formatNum(row.clicks)}</td>
                                    <td>{formatPerc(row.ctr)}</td>
                                    <td>{formatINR(row.cpm)}</td>
                                    <td className={getBgClass(row.conversions, 'conversionCount')}>
                                        {formatNum(row.conversions)}
                                    </td>
                                    <td className={getBgClass(row.leads, 'leadGenerated')}>
                                        {formatNum(row.leads)}
                                    </td>
                                    <td className={getBgClass(row.cpl, 'cpl')}>
                                        {formatINR(row.cpl)}
                                    </td>
                                    <td className={getBgClass(row.conversionRate, 'conversionRate')}>
                                        {formatPerc(row.conversionRate)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                <div className="d-flex justify-content-end mt-3 text-muted small">
                    {campaignData.length > 0 ? (
                        <>
                            1 - {Math.min(campaignData.length, 10)} / {campaignData.length}{' '}
                            <i className="fas fa-chevron-left ms-3 me-2"></i> <i className="fas fa-chevron-right"></i>
                        </>
                    ) : null}
                </div>
            </div>

        </div>
    );
}
