import React, { useState } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    Legend,
    LineChart,
    Line,
    ComposedChart
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import './Audience.css';

export default function Audience() {
    const [activeTab, setActiveTab] = useState('Demographics');
    const [genderFilter, setGenderFilter] = useState('All');

    // Platform View States
    const [platformMetric1, setPlatformMetric1] = useState('Reach');
    const [platformMetric2, setPlatformMetric2] = useState('Results');

    // New Filters
    const [platformSource, setPlatformSource] = useState('Facebook');
    const [dateFilters, setDateFilters] = useState({ startDate: '', endDate: '' });
    const [selectedDateRange, setSelectedDateRange] = useState('this_week');

    // --- MOCK DATA ---
    const initialData = [
        { age: '13-17', men: 0, women: 0 },
        { age: '18-24', men: 9, women: 4 },
        { age: '25-34', men: 31, women: 18 },
        { age: '35-44', men: 17, women: 9 },
        { age: '45-54', men: 5, women: 3 },
        { age: '55-64', men: 2, women: 1 },
        { age: '65+', men: 1, women: 0 },
    ];

    const citiesData = [
        { name: "Chennai, Tamil Nadu", val: 26.0, flag: "🇮🇳" },
        { name: "Coimbatore, Tamil Nadu", val: 4.7, flag: "🇮🇳" },
        { name: "Bangalore, Karnataka", val: 4.5, flag: "🇮🇳" },
        { name: "Madurai, Tamil Nadu", val: 2.7, flag: "🇮🇳" },
        { name: "Salem, Tamil Nadu", val: 1.8, flag: "🇮🇳" },
        { name: "Tiruchirappalli, Tamil Nadu", val: 1.7, flag: "🇮🇳" },
        { name: "Tirupur, Tamil Nadu", val: 1.4, flag: "🇮🇳" },
        { name: "Palladam, Tamil Nadu", val: 1.2, flag: "🇮🇳" },
        { name: "Pondicherry", val: 1.1, flag: "🇮🇳" },
        { name: "Colombo, Sri Lanka", val: 0.9, flag: "🇱🇰" },
    ];

    const countriesData = [
        { name: "India", val: 88.4, flag: "🇮🇳" },
        { name: "Sri Lanka", val: 2.7, flag: "🇱🇰" },
        { name: "Malaysia", val: 2.0, flag: "🇲🇾" },
        { name: "United Arab Emirates", val: 1.7, flag: "🇦🇪" },
        { name: "Singapore", val: 0.8, flag: "🇸🇬" },
        { name: "Saudi Arabia", val: 0.7, flag: "🇸🇦" },
        { name: "United Kingdom", val: 0.5, flag: "🇬🇧" },
        { name: "United States", val: 0.5, flag: "🇺🇸" },
        { name: "Qatar", val: 0.4, flag: "🇶🇦" },
        { name: "Kuwait", val: 0.4, flag: "🇰🇼" },
    ];

    const platformData = [
        { name: 'Facebook', reach: 480, results: 0 },
        { name: 'Instagram', reach: 30, results: 0 },
        { name: 'Audience Net', reach: 5, results: 0 },
        { name: 'Messenger', reach: 2, results: 0 },
        { name: 'Oculus', reach: 0, results: 0 },
        { name: 'Threads', reach: 0, results: 0 },
        { name: 'WhatsApp', reach: 0, results: 0 },
        { name: 'WhatsApp Bus', reach: 0, results: 0 },
    ];

    // Sample data for each Platform Source
    const getPlatformSourceData = (source) => {
        const baseData = [
            { date: '01 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '05 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '10 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '15 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '20 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '25 Nov', reach: 0, engagement: 0, impressions: 0 },
            { date: '30 Nov', reach: 0, engagement: 0, impressions: 0 },
        ];

        switch (source) {
            case 'Facebook':
                return [
                    { date: '01 Nov', reach: 12500, engagement: 3200, impressions: 18500 },
                    { date: '05 Nov', reach: 13200, engagement: 3400, impressions: 19200 },
                    { date: '10 Nov', reach: 14000, engagement: 3600, impressions: 20000 },
                    { date: '15 Nov', reach: 14800, engagement: 3800, impressions: 21000 },
                    { date: '20 Nov', reach: 15500, engagement: 4000, impressions: 22000 },
                    { date: '25 Nov', reach: 16200, engagement: 4200, impressions: 23000 },
                    { date: '30 Nov', reach: 17000, engagement: 4400, impressions: 24000 },
                ];
            case 'Instagram':
                return [
                    { date: '01 Nov', reach: 8500, engagement: 2100, impressions: 12000 },
                    { date: '05 Nov', reach: 9000, engagement: 2250, impressions: 12800 },
                    { date: '10 Nov', reach: 9500, engagement: 2400, impressions: 13500 },
                    { date: '15 Nov', reach: 10000, engagement: 2550, impressions: 14200 },
                    { date: '20 Nov', reach: 10500, engagement: 2700, impressions: 15000 },
                    { date: '25 Nov', reach: 11000, engagement: 2850, impressions: 15800 },
                    { date: '30 Nov', reach: 11500, engagement: 3000, impressions: 16500 },
                ];
            case 'My Health School Page':
                return [
                    { date: '01 Nov', reach: 3200, engagement: 850, impressions: 4800 },
                    { date: '05 Nov', reach: 3400, engagement: 920, impressions: 5100 },
                    { date: '10 Nov', reach: 3600, engagement: 990, impressions: 5400 },
                    { date: '15 Nov', reach: 3800, engagement: 1060, impressions: 5700 },
                    { date: '20 Nov', reach: 4000, engagement: 1130, impressions: 6000 },
                    { date: '25 Nov', reach: 4200, engagement: 1200, impressions: 6300 },
                    { date: '30 Nov', reach: 4400, engagement: 1270, impressions: 6600 },
                ];
            case 'Doctor Farmer Page':
                return [
                    { date: '01 Nov', reach: 2100, engagement: 580, impressions: 3100 },
                    { date: '05 Nov', reach: 2250, engagement: 620, impressions: 3300 },
                    { date: '10 Nov', reach: 2400, engagement: 660, impressions: 3500 },
                    { date: '15 Nov', reach: 2550, engagement: 700, impressions: 3700 },
                    { date: '20 Nov', reach: 2700, engagement: 740, impressions: 3900 },
                    { date: '25 Nov', reach: 2850, engagement: 780, impressions: 4100 },
                    { date: '30 Nov', reach: 3000, engagement: 820, impressions: 4300 },
                ];
            default:
                return baseData;
        }
    };

    // Date filter handlers
    const handleDateFilterChange = (e) => {
        const { name, value } = e.target;
        setDateFilters(prev => ({ ...prev, [name]: value }));
    };

    const applyDatePreset = (type) => {
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

        setDateFilters({
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0]
        });
    };

    // --- ANIMATION VARIANTS ---
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, duration: 0.5 }
        },
        exit: { opacity: 0, transition: { duration: 0.2 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 50 } }
    };

    const currentPlatformData = getPlatformSourceData(platformSource);

    // Reusable Filters Component
    const FiltersRow = () => (
        <motion.div
            className="d-flex align-items-center mb-4 gap-3 flex-wrap"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Platform Source Filter */}
            <div className="dropdown">
                <label className="form-label small fw-bold text-muted mb-2 d-block">Platform Source</label>
                <button
                    className="btn audience-dropdown-btn dropdown-toggle d-flex align-items-center gap-2"
                    type="button"
                    data-bs-toggle="dropdown"
                    style={{ minWidth: '220px', justifyContent: 'space-between' }}
                >
                    <span className="fw-bold">{platformSource}</span>
                </button>
                <ul className="dropdown-menu shadow-lg border-0 rounded-3 p-2" style={{ minWidth: '220px' }}>
                    <li>
                        <button 
                            className="dropdown-item rounded-2 fw-medium" 
                            onClick={() => setPlatformSource('Facebook')}
                        >
                            Facebook
                        </button>
                    </li>
                    <li>
                        <button 
                            className="dropdown-item rounded-2 fw-medium" 
                            onClick={() => setPlatformSource('Instagram')}
                        >
                            Instagram
                        </button>
                    </li>
                    <li>
                        <button 
                            className="dropdown-item rounded-2 fw-medium" 
                            onClick={() => setPlatformSource('My Health School Page')}
                        >
                            My Health School Page
                        </button>
                    </li>
                    <li>
                        <button 
                            className="dropdown-item rounded-2 fw-medium" 
                            onClick={() => setPlatformSource('Doctor Farmer Page')}
                        >
                            Doctor Farmer Page
                        </button>
                    </li>
                </ul>
            </div>

            {/* Date Filter (like BestPerformingAd) */}
            <div className="dropdown">
                <label className="form-label small fw-bold text-muted mb-2 d-block">Date</label>
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
                        height: '42px',
                        minWidth: '200px'
                    }}
                >
                    <i className="far fa-calendar-alt text-secondary opacity-75"></i>
                    <span className="fw-medium small text-dark flex-grow-1 text-center" style={{ fontSize: '0.9rem' }}>
                        {selectedDateRange.includes('Week') ? selectedDateRange : `${dateFilters.startDate ? 'Custom' : 'Select Date'}: ${selectedDateRange}`}
                    </span>
                    <i className="fas fa-chevron-down text-secondary opacity-50 small"></i>
                </div>
                <ul className="dropdown-menu shadow-lg border-0 rounded-3 p-3 mt-2" style={{ minWidth: '340px', backgroundColor: '#ffffff' }}>
                    <div className="mb-3">
                        <h6 className="dropdown-header text-uppercase x-small fw-bold text-muted ls-1 ps-0 mb-2" style={{ fontSize: '0.7rem' }}>Quick Select</h6>
                        <div className="d-flex gap-2">
                            <button onClick={() => applyDatePreset('last_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Last Week</button>
                            <button onClick={() => applyDatePreset('this_week')} className="btn btn-sm btn-outline-primary bg-primary-subtle text-primary border-primary flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>This Week</button>
                            <button onClick={() => applyDatePreset('next_week')} className="btn btn-sm btn-outline-light text-dark border shadow-sm flex-fill rounded-2 fw-medium" style={{ fontSize: '0.8rem' }}>Next Week</button>
                        </div>
                    </div>
                    <div className="dropdown-divider my-3 opacity-10"></div>
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
                                        value={dateFilters.startDate}
                                        onChange={handleDateFilterChange}
                                    />
                                </div>
                                <div className="pt-3 text-muted opacity-50"><i className="fas fa-arrow-right small"></i></div>
                                <div className="flex-fill">
                                    <label className="form-label x-small text-muted mb-1" style={{ fontSize: '0.7rem' }}>To</label>
                                    <input
                                        type="date"
                                        className="form-control form-control-sm border-light bg-light text-secondary fw-medium"
                                        name="endDate"
                                        value={dateFilters.endDate}
                                        onChange={handleDateFilterChange}
                                    />
                                </div>
                            </div>
                            <button
                                className="btn btn-primary w-100 btn-sm rounded-2 fw-bold mt-2 shadow-sm"
                                onClick={() => {
                                    const startDisplay = dateFilters.startDate ? new Date(dateFilters.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...';
                                    const endDisplay = dateFilters.endDate ? new Date(dateFilters.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '...';
                                    setSelectedDateRange(`${startDisplay} - ${endDisplay}`);
                                }}
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                </ul>
            </div>
        </motion.div>
    );

    return (
        <div className="container-fluid py-4">
            {/* Header Tabs with Icons - Using Explicit Custom Classes from Audience.css */}
            <motion.div
                className="d-flex align-items-center mb-4 gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`btn audience-tab-btn ${activeTab === 'Demographics' ? 'active' : 'inactive'}`}
                    onClick={() => setActiveTab('Demographics')}
                >
                    <span className="fs-5">👥</span> Demographics
                </motion.button>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`btn audience-tab-btn ${activeTab === 'Platform' ? 'active' : 'inactive'}`}
                    onClick={() => setActiveTab('Platform')}
                >
                    <span className="fs-5">📲</span> Platform
                </motion.button>
            </motion.div>

            {/* Filters Above Platform Source Chart */}
            <FiltersRow />

            {/* Platform Source Chart - High-Five Style */}
            <motion.div
                className="card border-0 shadow-sm rounded-4 bg-white p-4 mb-4"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                    duration: 0.6, 
                    ease: [0.16, 1, 0.3, 1],
                    type: "spring",
                    stiffness: 100,
                    damping: 15
                }}
                whileHover={{ 
                    scale: 1.01, 
                    y: -5,
                    transition: { 
                        type: "spring", 
                        stiffness: 300,
                        damping: 20
                    } 
                }}
            >
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                >
                    <h5 className="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
                        📊 {platformSource} Performance
                    </h5>
                    <small className="text-secondary text-muted">Audience insights for {platformSource}</small>
                </motion.div>
                <motion.div 
                    className="mt-4"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, duration: 0.6, ease: "easeOut" }}
                >
                    <div style={{ width: '100%', height: 400 }}>
                        <AnimatePresence mode="wait">
                            {platformSource === 'Facebook' && (
                                <motion.div
                                    key="facebook"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.5 }}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    <ResponsiveContainer>
                                        <AreaChart data={currentPlatformData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <defs>
                                                <linearGradient id={`colorReach-${platformSource}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#1877F2" stopOpacity={0.5} />
                                                    <stop offset="95%" stopColor="#1877F2" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id={`colorEngagement-${platformSource}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#00bcd4" stopOpacity={0.5} />
                                                    <stop offset="95%" stopColor="#00bcd4" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id={`colorImpressions-${platformSource}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="left"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ 
                                                    borderRadius: '12px', 
                                                    border: 'none', 
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', 
                                                    padding: '12px',
                                                    backgroundColor: 'white'
                                                }}
                                                animationDuration={200}
                                            />
                                            <Legend 
                                                wrapperStyle={{ paddingTop: '20px' }}
                                                iconType="circle"
                                            />
                                            <Area
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="reach"
                                                stroke="#1877F2"
                                                strokeWidth={3}
                                                fill={`url(#colorReach-${platformSource})`}
                                                name="Reach"
                                                animationBegin={0}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 5, fill: '#1877F2', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8, fill: '#1877F2', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Area
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="engagement"
                                                stroke="#00bcd4"
                                                strokeWidth={3}
                                                fill={`url(#colorEngagement-${platformSource})`}
                                                name="Engagement"
                                                animationBegin={200}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 5, fill: '#00bcd4', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8, fill: '#00bcd4', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Area
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="impressions"
                                                stroke="#10B981"
                                                strokeWidth={3}
                                                fill={`url(#colorImpressions-${platformSource})`}
                                                name="Impressions"
                                                animationBegin={400}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8, fill: '#10B981', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}
                            {platformSource === 'Instagram' && (
                                <motion.div
                                    key="instagram"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.5 }}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    <ResponsiveContainer>
                                        <ComposedChart data={currentPlatformData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <defs>
                                                <linearGradient id={`colorReach-${platformSource}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#E4405F" stopOpacity={0.5} />
                                                    <stop offset="95%" stopColor="#E4405F" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id={`colorEngagement-${platformSource}`} x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#F56040" stopOpacity={0.4} />
                                                    <stop offset="95%" stopColor="#F56040" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="left"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ 
                                                    borderRadius: '12px', 
                                                    border: 'none', 
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', 
                                                    padding: '12px',
                                                    backgroundColor: 'white'
                                                }}
                                                animationDuration={200}
                                            />
                                            <Legend 
                                                wrapperStyle={{ paddingTop: '20px' }}
                                                iconType="circle"
                                            />
                                            <Area
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="reach"
                                                stroke="#E4405F"
                                                strokeWidth={3}
                                                fill={`url(#colorReach-${platformSource})`}
                                                name="Reach"
                                                animationBegin={0}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 5, fill: '#E4405F', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8, fill: '#E4405F', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="engagement"
                                                stroke="#F56040"
                                                strokeWidth={3}
                                                name="Engagement"
                                                animationBegin={200}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 5, fill: '#F56040', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 8, fill: '#F56040', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Bar
                                                yAxisId="right"
                                                dataKey="impressions"
                                                fill="#10B981"
                                                name="Impressions"
                                                radius={[6, 6, 0, 0]}
                                                animationBegin={400}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                            />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}
                            {platformSource === 'My Health School Page' && (
                                <motion.div
                                    key="health"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.5 }}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    <ResponsiveContainer>
                                        <BarChart data={currentPlatformData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barSize={40} barGap={8}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="left"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ 
                                                    borderRadius: '12px', 
                                                    border: 'none', 
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', 
                                                    padding: '12px',
                                                    backgroundColor: 'white'
                                                }}
                                                animationDuration={200}
                                            />
                                            <Legend 
                                                wrapperStyle={{ paddingTop: '20px' }}
                                                iconType="circle"
                                            />
                                            <Bar
                                                yAxisId="left"
                                                dataKey="reach"
                                                fill="#5b45b0"
                                                name="Reach"
                                                radius={[6, 6, 0, 0]}
                                                animationBegin={0}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                            />
                                            <Bar
                                                yAxisId="left"
                                                dataKey="engagement"
                                                fill="#00bcd4"
                                                name="Engagement"
                                                radius={[6, 6, 0, 0]}
                                                animationBegin={200}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                            />
                                            <Bar
                                                yAxisId="right"
                                                dataKey="impressions"
                                                fill="#10B981"
                                                name="Impressions"
                                                radius={[6, 6, 0, 0]}
                                                animationBegin={400}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}
                            {platformSource === 'Doctor Farmer Page' && (
                                <motion.div
                                    key="doctor"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    transition={{ duration: 0.5 }}
                                    style={{ width: '100%', height: '100%' }}
                                >
                                    <ResponsiveContainer>
                                        <LineChart data={currentPlatformData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis 
                                                dataKey="date" 
                                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="left"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <YAxis 
                                                yAxisId="right"
                                                orientation="right"
                                                tick={{ fill: '#64748b', fontSize: 12 }} 
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ 
                                                    borderRadius: '12px', 
                                                    border: 'none', 
                                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', 
                                                    padding: '12px',
                                                    backgroundColor: 'white'
                                                }}
                                                animationDuration={200}
                                            />
                                            <Legend 
                                                wrapperStyle={{ paddingTop: '20px' }}
                                                iconType="circle"
                                            />
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="reach"
                                                stroke="#5b45b0"
                                                strokeWidth={4}
                                                name="Reach"
                                                animationBegin={0}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 6, fill: '#5b45b0', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 10, fill: '#5b45b0', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Line
                                                yAxisId="left"
                                                type="monotone"
                                                dataKey="engagement"
                                                stroke="#00bcd4"
                                                strokeWidth={4}
                                                name="Engagement"
                                                animationBegin={200}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 6, fill: '#00bcd4', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 10, fill: '#00bcd4', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                            <Line
                                                yAxisId="right"
                                                type="monotone"
                                                dataKey="impressions"
                                                stroke="#10B981"
                                                strokeWidth={4}
                                                name="Impressions"
                                                animationBegin={400}
                                                animationDuration={1500}
                                                animationEasing="ease-out"
                                                dot={{ r: 6, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                                                activeDot={{ r: 10, fill: '#10B981', strokeWidth: 3, stroke: '#fff' }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>
            </motion.div>

            {/* Main Content Card */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    className="card border-0 shadow-sm rounded-4 bg-white p-4"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    {activeTab === 'Demographics' ? (
                        /* ================= DEMOGRAPHICS VIEW ================= */
                        <>
                            {/* Filters Above Age & Gender Distribution Chart */}
                            <FiltersRow />

                            {/* 1. Demographics Chart Section (TOP) */}
                            <motion.div variants={itemVariants} className="mb-5">
                                <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
                                    <div>
                                        <h5 className="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
                                            📊 Age & Gender Distribution
                                        </h5>
                                        <small className="text-secondary text-muted">Audience breakdown by demographics</small>
                                    </div>

                                    <div className="d-flex gap-2">
                                        <div className="dropdown">
                                            <button
                                                className="btn audience-dropdown-btn dropdown-toggle"
                                                type="button"
                                                data-bs-toggle="dropdown"
                                            >
                                                <span>
                                                    {genderFilter === 'All' ? '👫 All Genders' : genderFilter === 'Men' ? '👨 Men Only' : '👩 Women Only'}
                                                </span>
                                            </button>
                                            <ul className="dropdown-menu shadow-lg border-0 rounded-3 p-2">
                                                <li><button className="dropdown-item rounded-2 fw-medium" onClick={() => setGenderFilter('All')}>👫 All</button></li>
                                                <li><button className="dropdown-item rounded-2 fw-medium" onClick={() => setGenderFilter('Men')}>👨 Men</button></li>
                                                <li><button className="dropdown-item rounded-2 fw-medium" onClick={() => setGenderFilter('Women')}>👩 Women</button></li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ width: '100%', height: 350 }}>
                                    <ResponsiveContainer>
                                        <BarChart data={initialData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barSize={32} barGap={8}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="age" tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} axisLine={false} tickLine={false} dy={10} />
                                            <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '12px' }}
                                            />
                                            {(genderFilter === 'All' || genderFilter === 'Men') && (
                                                <Bar dataKey="men" name="Men" fill="#5b45b0" radius={[6, 6, 0, 0]} animationDuration={1500} />
                                            )}
                                            {(genderFilter === 'All' || genderFilter === 'Women') && (
                                                <Bar dataKey="women" name="Women" fill="#00bcd4" radius={[6, 6, 0, 0]} animationDuration={1500} />
                                            )}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="d-flex justify-content-center gap-4 mt-4">
                                    <div className="d-flex align-items-center gap-2 px-3 py-2 bg-light rounded-pill">
                                        <div className="rounded-circle" style={{ width: 12, height: 12, background: '#5b45b0' }}></div>
                                        <span className="fw-bold text-dark small">Men</span>
                                    </div>
                                    <div className="d-flex align-items-center gap-2 px-3 py-2 bg-light rounded-pill">
                                        <div className="rounded-circle" style={{ width: 12, height: 12, background: '#00bcd4' }}></div>
                                        <span className="fw-bold text-dark small">Women</span>
                                    </div>
                                </div>
                            </motion.div>

                            <div className="border-bottom my-5"></div>

                            {/* 2. Top Listed Locations (BOTTOM) */}
                            <motion.div variants={itemVariants} className="row g-5">
                                {/* Cities */}
                                <div className="col-lg-6">
                                    <h6 className="fw-bold mb-4 text-dark d-flex align-items-center gap-2">
                                        🏙️ Top Cities
                                    </h6>
                                    <div className="d-flex flex-column gap-4">
                                        {citiesData.map((city, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ width: 0 }}
                                                whileInView={{ width: '100%' }}
                                                viewport={{ once: true }}
                                            >
                                                <div className="d-flex justify-content-between mb-2">
                                                    <span className="text-dark fw-bold small d-flex align-items-center gap-2">{city.flag} {city.name}</span>
                                                    <span className="text-muted small fw-bold">{city.val}%</span>
                                                </div>
                                                <div className="progress" style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
                                                    <motion.div
                                                        className="progress-bar"
                                                        role="progressbar"
                                                        style={{ backgroundColor: '#00bcd4', borderRadius: '10px' }}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${city.val}%` }}
                                                        transition={{ duration: 1.5, delay: idx * 0.1, ease: "easeOut" }}
                                                    ></motion.div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>

                                {/* Countries */}
                                <div className="col-lg-6">
                                    <h6 className="fw-bold mb-4 text-dark d-flex align-items-center gap-2">
                                        🌍 Top Countries
                                    </h6>
                                    <div className="d-flex flex-column gap-4">
                                        {countriesData.map((country, idx) => (
                                            <motion.div
                                                key={idx}
                                                initial={{ width: 0 }}
                                                whileInView={{ width: '100%' }}
                                                viewport={{ once: true }}
                                            >
                                                <div className="d-flex justify-content-between mb-2">
                                                    <span className="text-dark fw-bold small d-flex align-items-center gap-2">{country.flag} {country.name}</span>
                                                    <span className="text-muted small fw-bold">{country.val}%</span>
                                                </div>
                                                <div className="progress" style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '10px', overflow: 'hidden' }}>
                                                    <motion.div
                                                        className="progress-bar"
                                                        role="progressbar"
                                                        style={{ backgroundColor: '#5b45b0', borderRadius: '10px' }}
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${country.val}%` }}
                                                        transition={{ duration: 1.5, delay: idx * 0.1, ease: "easeOut" }}
                                                    ></motion.div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        </>
                    ) : (
                        /* ================= PLATFORM VIEW ================= */
                        <motion.div variants={itemVariants}>
                            <div className="d-flex justify-content-between align-items-center mb-5 flex-wrap gap-3">
                                <div>
                                    <h4 className="fw-bold mb-1 text-dark d-flex align-items-center gap-2">
                                        Placement per platform
                                    </h4>
                                    <small className="text-secondary text-muted">Insights on where your ads are being seen</small>
                                </div>
                                <div className="d-flex gap-3">
                                    {/* Metric 1 Dropdown (Purple) */}
                                    <div className="dropdown">
                                        <button className="btn audience-dropdown-btn dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                            <div className="d-flex align-items-center gap-2">
                                                <div className="rounded" style={{ width: 16, height: 16, background: '#5b45b0' }}></div>
                                                <span className="fw-bold">{platformMetric1}</span>
                                            </div>
                                        </button>
                                        <ul className="dropdown-menu shadow-sm border-0">
                                            <li><button className="dropdown-item" onClick={() => setPlatformMetric1('Reach')}>Reach</button></li>
                                            <li><button className="dropdown-item" onClick={() => setPlatformMetric1('Impressions')}>Impressions</button></li>
                                        </ul>
                                    </div>

                                    {/* Metric 2 Dropdown (Teal) */}
                                    <div className="dropdown">
                                        <button className="btn audience-dropdown-btn dropdown-toggle" type="button" data-bs-toggle="dropdown">
                                            <div className="d-flex align-items-center gap-2">
                                                <div className="rounded" style={{ width: 16, height: 16, background: '#00bcd4' }}></div>
                                                <span className="fw-bold">{platformMetric2}</span>
                                            </div>
                                        </button>
                                        <ul className="dropdown-menu shadow-sm border-0">
                                            <li><button className="dropdown-item" onClick={() => setPlatformMetric2('Results')}>Results</button></li>
                                            <li><button className="dropdown-item" onClick={() => setPlatformMetric2('Clicks')}>Clicks</button></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div style={{ width: '100%', height: 400 }}>
                                <ResponsiveContainer>
                                    <BarChart data={platformData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }} barSize={40} barGap={0}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fill: '#334155', fontSize: 13, fontWeight: 500 }}
                                            axisLine={false}
                                            tickLine={false}
                                            dy={10}
                                        />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', padding: '12px' }}
                                        />
                                        <Bar dataKey="reach" name={platformMetric1} fill="#5b45b0" radius={[4, 4, 0, 0]} animationDuration={1500} />
                                        <Bar dataKey="results" name={platformMetric2} fill="#00bcd4" radius={[4, 4, 0, 0]} animationDuration={1500} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <p className="text-muted small mt-4 text-center">
                                * You may see low delivery of ads to certain placements until data is fully available.
                            </p>
                        </motion.div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
