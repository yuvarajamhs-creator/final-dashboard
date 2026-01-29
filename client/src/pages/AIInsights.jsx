import { useState } from 'react';
import './AIInsights.css';

export default function AIInsights() {
    const [activeTimeWindow, setActiveTimeWindow] = useState('lastWeek');
    const [_selectedPlatform, _setSelectedPlatform] = useState('all');
    void _selectedPlatform;
    void _setSelectedPlatform;

    // --- MOCK DATA: ADS PERFORMANCE ---
    const adsData = {
        lastMonth: {
            name: 'Summer Sale - Video Campaign',
            platform: 'Meta',
            spend: 4500,
            leads: 780,
            cpl: 5.77,
            reason: 'Achieved lowest CPL with highest conversion rate at 32.4%. Strong engagement from 25-34 age group.',
            action: 'SCALE'
        },
        lastWeek: {
            name: 'Product Launch - Carousel Ads',
            platform: 'Meta',
            spend: 1200,
            leads: 245,
            cpl: 4.90,
            reason: 'Exceptional performance with 28% conversion rate. Outperformed all other campaigns by 40%.',
            action: 'SCALE'
        },
        thisWeek: {
            name: 'Retargeting - Website Visitors',
            platform: 'Website',
            spend: 650,
            leads: 98,
            cpl: 6.63,
            reason: 'Strong performance from warm traffic. Quality leads with high purchase intent.',
            action: 'MONITOR'
        },
        today: {
            name: 'Flash Sale - Story Ads',
            platform: 'Meta',
            spend: 180,
            leads: 42,
            cpl: 4.29,
            reason: 'Early momentum showing strong CTR at 3.2%. Excellent engagement on mobile.',
            action: 'SCALE'
        }
    };

    // --- MOCK DATA: REELS PERFORMANCE ---
    const reelsData = {
        lastMonth: {
            name: 'Product Demo - Holiday Edition',
            platform: 'Instagram',
            reach: 125000,
            engagements: 8400,
            saves: 920,
            reason: 'Viral reach with 6.7% engagement rate. Highest saves indicating strong content value.',
            action: 'REPURPOSE'
        },
        lastWeek: {
            name: 'Behind The Scenes - Team Culture',
            platform: 'Facebook',
            reach: 45000,
            engagements: 3200,
            saves: 280,
            reason: 'Strong organic reach with 7.1% engagement. Authentic content resonating well.',
            action: 'BOOST'
        },
        thisWeek: {
            name: 'Customer Testimonial #12',
            platform: 'Instagram',
            reach: 28000,
            engagements: 1950,
            saves: 180,
            reason: 'High trust signals with strong save rate. Quality engagement from target audience.',
            action: 'BOOST'
        },
        today: {
            name: 'Quick Tip - Industry Hack',
            platform: 'Instagram',
            reach: 12000,
            engagements: 890,
            saves: 95,
            reason: 'Rapid early engagement at 7.4%. Educational content performing above baseline.',
            action: 'MONITOR'
        }
    };

    // --- AI INSIGHTS FEED DATA ---
    const insights = [
        {
            id: 1,
            type: 'AD PERFORMANCE',
            timeWindow: 'Last Week',
            category: 'success',
            text: 'Meta carousel ads showing 40% better performance than single image ads. Recommend shifting 30% of budget allocation.',
            action: '→ Increase carousel ad budget'
        },
        {
            id: 2,
            type: 'REEL MOMENTUM',
            timeWindow: 'This Week',
            category: 'success',
            text: 'Educational reel content generating 2.5x more saves than promotional content. Audience favors value-driven content.',
            action: '→ Produce more educational reels'
        },
        {
            id: 3,
            type: 'COST EFFICIENCY',
            timeWindow: 'Today',
            category: 'warning',
            text: 'Story ad CPL dropped to $4.29, outperforming feed ads by 35%. Consider budget reallocation.',
            action: '→ Scale story ad placements'
        },
        {
            id: 4,
            type: 'AUDIENCE INSIGHT',
            timeWindow: 'Last Month',
            category: 'info',
            text: 'Mobile-first audiences converting 28% better than desktop. Optimize creative for mobile viewing.',
            action: '→ Prioritize mobile-optimized ads'
        },
        {
            id: 5,
            type: 'CONTENT FATIGUE',
            timeWindow: 'Last Week',
            category: 'warning',
            text: 'Engagement on promotional reels declining by 15%. Ad fatigue detected across Instagram placements.',
            action: '→ Refresh creative assets'
        },
        {
            id: 6,
            type: 'CONVERSION QUALITY',
            timeWindow: 'This Week',
            category: 'success',
            text: 'Retargeting campaigns delivering 52% higher quality leads. Purchase rate 3x higher than cold traffic.',
            action: '→ Expand retargeting audiences'
        }
    ];

    // --- RECOMMENDATION ACTIONS ---
    const recommendations = [
        {
            id: 1,
            title: 'Scale Ad Budget',
            icon: '📈',
            color: 'green',
            justification: 'Top performing ads showing consistent CPL below $5.00 with strong conversion rates. Opportunity to capture 40% more qualified leads.'
        },
        {
            id: 2,
            title: 'Pause Underperforming Ads',
            icon: '⏸️',
            color: 'red',
            justification: '3 campaigns with CPL above $12 and declining conversion rates. Immediate pause will save $850/week in wasted spend.'
        },
        {
            id: 3,
            title: 'Boost Top Reel',
            icon: '🚀',
            color: 'blue',
            justification: 'Educational reel showing viral potential with 7.4% organic engagement. Paid boost could deliver 3-5x reach expansion.'
        },
        {
            id: 4,
            title: 'Repurpose Reel Content',
            icon: '♻️',
            color: 'purple',
            justification: 'Product demo reel generated 920 saves. High content value indicates strong repurposing potential across multiple formats.'
        }
    ];

    // Get current time window data
    const currentAd = adsData[activeTimeWindow];
    const currentReel = reelsData[activeTimeWindow];

    return (
        <div className="ai-insights-container">
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

            {/* FILTER CONTROLS */}
            <div className="ai-filters">
                <div className="filter-chip">
                    <i className="fas fa-layer-group"></i>
                    Platform: All
                    <i className="fas fa-chevron-down small"></i>
                </div>
                <div className="filter-chip">
                    <i className="fas fa-calendar-alt"></i>
                    Last 30 Days
                    <i className="fas fa-chevron-down small"></i>
                </div>
                <div className="filter-chip">
                    <i className="fas fa-map-marker-alt"></i>
                    All Locations
                    <i className="fas fa-chevron-down small"></i>
                </div>
                <div className="filter-chip">
                    <i className="fas fa-users"></i>
                    All Age Groups
                    <i className="fas fa-chevron-down small"></i>
                </div>
            </div>

            {/* SUMMARY CARDS */}
            <div className="summary-cards-grid">
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
                {/* LEFT: BEST PERFORMING AD */}
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

                {/* RIGHT: BEST PERFORMING REEL */}
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
