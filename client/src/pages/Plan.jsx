import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, Reorder, useMotionValue, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Plan.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:4000';

function getAuthHeaders() {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Plan() {
    // --- STATE ---
    const [tasks, setTasks] = useState([
        { id: '1', title: "Publish one ad", subtitle: "Boost engagement immediately", current: 0, target: 1, unit: "ad", icon: "fas fa-bullhorn", platformIcon: null, btnText: "Create ad", isCompleted: false },
        { id: '2', title: "Publish 16 stories", subtitle: "Est. views: 61.1K - 81.8K", current: 6, target: 16, unit: "stories", icon: "fas fa-camera", platformIcon: "fab fa-instagram", platformColor: "linear-gradient(45deg, #f09433 0%, #bc1888 100%)", btnText: "Create story", isCompleted: false },
        { id: '3', title: "Post 13 times on FB", subtitle: "Est. reach: 88.1K - 2M", current: 4, target: 13, unit: "posts", icon: "fas fa-pen-nib", platformIcon: "fab fa-facebook", platformColor: "#1877f2", btnText: "Create Post", isCompleted: false },
        { id: '4', title: "Post 12 times on Insta", subtitle: "Est. reach: 396K - 1.2M", current: 4, target: 12, unit: "posts", icon: "fas fa-image", platformIcon: "fab fa-instagram", platformColor: "linear-gradient(45deg, #f09433 0%, #bc1888 100%)", btnText: "Create Post", isCompleted: false },
        { id: '5', title: "Share 16 FB Stories", subtitle: "Est. views: 5.8K - 10.4K", current: 6, target: 16, unit: "stories", icon: "fas fa-history", platformIcon: "fab fa-facebook", platformColor: "#1877f2", btnText: "Create story", isCompleted: false },
        { id: '6', title: "Check Insights", subtitle: "Review your weekly growth", current: 0, target: 1, unit: "completed", icon: "fas fa-chart-pie", platformIcon: null, btnText: null, isCompleted: false },
        { id: '7', title: "Reply to comments", subtitle: "Maintain 0.75% response rate", current: 1, target: 1, unit: "completed", icon: "fas fa-comments", platformIcon: null, btnText: "Completed", isCompleted: true }
    ]);

    const [selectedDateRange, setSelectedDateRange] = useState('This Week');
    const [filters, setFilters] = useState({
        startDate: '',
        endDate: ''
    });

    // Team Performance & Effort & Goals state
    const [teams, setTeams] = useState([]);
    const [aggregates, setAggregates] = useState({ data: [], budgetForecast: { weekly_ad_spend_target: 0, actual_ad_spend: 0, remaining_budget: 0, forecast_ad_spend: 0 } });
    const [aggregatesLoading, setAggregatesLoading] = useState(false);
    const [aggregatesError, setAggregatesError] = useState(null);
    const [pages, setPages] = useState([]);
    const [showAddTeamModal, setShowAddTeamModal] = useState(false);
    const [showTargetsModal, setShowTargetsModal] = useState(false);
    const [editingTargetsTeamId, setEditingTargetsTeamId] = useState(null);
    const [targetsForm, setTargetsForm] = useState({ target_followers: '', target_ad_spend: '', target_organic_leads: '', target_organic_revenue: '', target_stories: '', target_reels: '', target_posts: '' });
    const [savingTargets, setSavingTargets] = useState(false);
    const [newTeam, setNewTeam] = useState({ name: '', page_id: '' });
    const [savingTeam, setSavingTeam] = useState(false);
    const [addTeamError, setAddTeamError] = useState(null);
    const [_effortPlatform, _setEffortPlatform] = useState('instagram');

    // Helper: Calculate Date Range (Mon-Sun)
    const getRange = (type) => {
        const today = new Date();
        const currentDay = today.getDay(); // 0(Sun) - 6(Sat)
        // Calculate days to subtract to get to Monday (1)
        // If Sunday(0), subtract 6. If Mon(1), subtract 0. If Tue(2), subtract 1.
        const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() + diffToMonday);
        weekStart.setHours(0, 0, 0, 0);

        let start = new Date(weekStart);
        let offset = 0;

        if (type === 'last_week') offset = -7;
        if (type === 'next_week') offset = 7;

        start.setDate(weekStart.getDate() + offset);

        const end = new Date(start);
        end.setDate(start.getDate() + 6); // +6 days for Mon->Sun

        const formatDate = (d) => {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
        };

        const formatLabel = (d) => {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        };

        return {
            label: type === 'this_week' ? 'This Week' : type === 'last_week' ? 'Last Week' : 'Next Week',
            displayRange: `${formatLabel(start)} - ${formatLabel(end)}`,
            startDate: formatDate(start),
            endDate: formatDate(end)
        };
    };

    // Initialize with This Week
    useEffect(() => {
        const range = getRange('this_week');
        setFilters({ startDate: range.startDate, endDate: range.endDate });
        setSelectedDateRange(range.displayRange);
    }, []);

    const applyPreset = (type) => {
        const range = getRange(type);
        setFilters({ startDate: range.startDate, endDate: range.endDate });
        setSelectedDateRange(range.displayRange);
    };

    const handleFilterChange = (e) => {
        const { name, value } = e.target;
        setFilters(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const weekStart = filters.startDate || null;

    const fetchTeams = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/plan/teams`, { headers: getAuthHeaders() });
            if (!res.ok) throw new Error('Failed to load teams');
            const json = await res.json();
            setTeams(json.data || []);
        } catch (e) {
            console.error('Plan fetchTeams', e);
            setTeams([]);
        }
    }, []);

    const fetchPages = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/meta/pages`, { headers: getAuthHeaders() });
            if (!res.ok) return;
            const json = await res.json();
            setPages(Array.isArray(json.data) ? json.data : (json.data?.data ? json.data.data : []));
        } catch (e) {
            console.warn('Plan fetchPages', e);
        }
    }, []);

    const fetchAggregates = useCallback(async () => {
        if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
            setAggregates({ data: [], budgetForecast: { weekly_ad_spend_target: 0, actual_ad_spend: 0, remaining_budget: 0, forecast_ad_spend: 0 } });
            return;
        }
        setAggregatesLoading(true);
        setAggregatesError(null);
        try {
            const res = await fetch(`${API_BASE}/api/plan/aggregates?week_start=${encodeURIComponent(weekStart)}`, { headers: getAuthHeaders() });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || res.statusText);
            }
            const json = await res.json();
            setAggregates({ data: json.data || [], budgetForecast: json.budgetForecast || {} });
        } catch (e) {
            setAggregatesError(e.message || 'Failed to load aggregates');
            setAggregates({ data: [], budgetForecast: {} });
        } finally {
            setAggregatesLoading(false);
        }
    }, [weekStart]);

    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);

    useEffect(() => {
        fetchPages();
    }, [fetchPages]);

    useEffect(() => {
        fetchAggregates();
    }, [fetchAggregates]);

    const openTargetsModal = (item) => {
        const t = item?.targets || {};
        setTargetsForm({
            target_followers: t.followers ?? '',
            target_ad_spend: t.ad_spend ?? '',
            target_organic_leads: t.organic_leads ?? '',
            target_organic_revenue: t.organic_revenue ?? '',
            target_stories: t.stories ?? '',
            target_reels: t.reels ?? '',
            target_posts: t.posts ?? ''
        });
        setEditingTargetsTeamId(item?.team?.id ?? null);
        setShowTargetsModal(true);
    };

    const openTargetsForTeam = (team) => {
        setTargetsForm({
            target_followers: '', target_ad_spend: '', target_organic_leads: '', target_organic_revenue: '',
            target_stories: '', target_reels: '', target_posts: ''
        });
        setEditingTargetsTeamId(team?.id ?? null);
        setShowTargetsModal(true);
    };

    const saveTargets = async () => {
        if (!editingTargetsTeamId || !weekStart) return;
        setSavingTargets(true);
        try {
            const res = await fetch(`${API_BASE}/api/plan/targets`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    team_id: editingTargetsTeamId,
                    week_start: weekStart,
                    target_followers: Number(targetsForm.target_followers) || 0,
                    target_ad_spend: Number(targetsForm.target_ad_spend) || 0,
                    target_organic_leads: Number(targetsForm.target_organic_leads) || 0,
                    target_organic_revenue: Number(targetsForm.target_organic_revenue) || 0,
                    target_stories: Number(targetsForm.target_stories) || 0,
                    target_reels: Number(targetsForm.target_reels) || 0,
                    target_posts: Number(targetsForm.target_posts) || 0
                })
            });
            if (!res.ok) throw new Error('Failed to save targets');
            setShowTargetsModal(false);
            fetchAggregates();
            fetchTeams();
        } catch (e) {
            console.error('saveTargets', e);
        } finally {
            setSavingTargets(false);
        }
    };

    const saveNewTeam = async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const name = (newTeam.name || '').trim();
        if (!name) return;
        setSavingTeam(true);
        setAddTeamError(null);
        try {
            const res = await fetch(`${API_BASE}/api/plan/teams`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                body: JSON.stringify({
                    name,
                    page_id: newTeam.page_id || null
                })
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(json.error || res.statusText || 'Failed to add team');
            }
            setShowAddTeamModal(false);
            setNewTeam({ name: '', page_id: '' });
            setAddTeamError(null);
            fetchTeams();
            fetchAggregates();
        } catch (e) {
            console.error('saveNewTeam', e);
            setAddTeamError(e.message || 'Failed to add team');
        } finally {
            setSavingTeam(false);
        }
    };

    const deleteTeam = async (teamId) => {
        if (!window.confirm('Remove this team? Targets for this team will be deleted.')) return;
        try {
            const res = await fetch(`${API_BASE}/api/plan/teams/${teamId}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (!res.ok) throw new Error('Failed to delete team');
            fetchTeams();
            fetchAggregates();
        } catch (e) {
            console.error('deleteTeam', e);
        }
    };

    const formatNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Number(n)));
    const formatCurrency = (n) => (n == null || n === '' ? '0' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`);

    // --- CLOCK LOGIC ---
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
        return () => clearInterval(timer);
    }, []);

    const completedCount = tasks.filter(t => t.current >= t.target || t.isCompleted).length;
    const totalCount = tasks.length;
    const progressPercent = (completedCount / totalCount) * 100;

    // --- DRAGGABLE GOAL LOGIC ---
    const progressBarRef = useRef(null);
    const [goalTasks, setGoalTasks] = useState(5);
    const x = useMotionValue(0);
    const [barWidth, setBarWidth] = useState(0);

    useEffect(() => {
        if (progressBarRef.current) {
            setBarWidth(progressBarRef.current.offsetWidth);
            x.set(progressBarRef.current.offsetWidth * (5 / 7));
        }
    }, [x]);

    const handleDrag = (event, info) => {
        if (barWidth > 0) {
            const currentX = x.get();
            const percent = Math.max(0, Math.min(1, currentX / barWidth));
            const newGoal = Math.round(percent * totalCount);
            setGoalTasks(Math.max(1, newGoal));
        }
    };

    // Animation Variants
    const itemVariants = {
        hidden: { opacity: 0, y: 15 },
        visible: { opacity: 1, y: 0 }
    };

    const isSchemaError = aggregatesError && (aggregatesError.includes('plan_teams') || aggregatesError.includes('schema cache') || aggregatesError.includes('Could not find'));

    return (
        <div className="plan-page">

            {/* --- STICKY HEADER: Plan title + Date range --- */}
            <header className="plan-header">
                <div className="plan-header-inner">
                    <h1 className="plan-page-title">Plan</h1>
                    <div className="dropdown plan-date-dropdown">
                        <div
                            className="plan-date-trigger"
                            role="button"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                        >
                            <i className="far fa-calendar-alt plan-date-icon"></i>
                            <span className="plan-date-label">
                                {selectedDateRange.includes(':') ? selectedDateRange : (filters.startDate ? `Custom: ${selectedDateRange}` : selectedDateRange)}
                            </span>
                            <i className="fas fa-chevron-down plan-date-chevron"></i>
                        </div>
                        <ul className="dropdown-menu dropdown-menu-end plan-date-menu">
                            <div className="plan-date-presets">
                                <span className="plan-date-presets-title">Quick Select</span>
                                <div className="plan-date-presets-btns">
                                    <button type="button" className="plan-date-preset-btn" onClick={() => applyPreset('last_week')}>Last Week</button>
                                    <button type="button" className="plan-date-preset-btn plan-date-preset-btn-active" onClick={() => applyPreset('this_week')}>This Week</button>
                                    <button type="button" className="plan-date-preset-btn" onClick={() => applyPreset('next_week')}>Next Week</button>
                                </div>
                            </div>
                            <div className="plan-date-divider"></div>
                            <div className="plan-date-custom">
                                <span className="plan-date-presets-title">Custom Range</span>
                                <div className="plan-date-custom-fields">
                                    <div className="plan-date-field">
                                        <label className="plan-date-field-label">From</label>
                                        <input type="date" className="form-control form-control-sm" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
                                    </div>
                                    <div className="plan-date-arrow">→</div>
                                    <div className="plan-date-field">
                                        <label className="plan-date-field-label">To</label>
                                        <input type="date" className="form-control form-control-sm" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
                                    </div>
                                </div>
                                <button type="button" className="plan-date-apply-btn" onClick={() => {
                                    const startDisplay = filters.startDate ? new Date(filters.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...';
                                    const endDisplay = filters.endDate ? new Date(filters.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...';
                                    setSelectedDateRange(`Custom: ${startDisplay} - ${endDisplay}`);
                                }}>Apply Range</button>
                            </div>
                        </ul>
                    </div>
                </div>
            </header>

            <div className="plan-content">

                {/* --- HERO: Weekly Plan card (goal + progress bar + stats) --- */}
                <section className="plan-hero plan-card">
                    <h2 className="plan-hero-title">Weekly Plan</h2>
                    <p className="plan-hero-tagline">Maximize your audience reach by hitting your targets!</p>
                    <div className="plan-hero-goal">
                        <span className="plan-hero-goal-text">Complete at least</span>
                        <motion.span key={goalTasks} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className="plan-hero-goal-num">{goalTasks}</motion.span>
                        <span className="plan-hero-goal-text">tasks to win</span>
                        <span className="plan-hero-goal-emoji">🏆</span>
                    </div>
                    <motion.div className="plan-hero-progress-wrap" ref={progressBarRef} whileHover={{ scale: 1.005 }}>
                        <div className="plan-hero-progress-track">
                            <motion.div className="plan-hero-progress-fill" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
                        </div>
                        <motion.div drag="x" dragConstraints={progressBarRef} dragElastic={0.05} dragMomentum={false} onDrag={handleDrag} style={{ x, position: 'absolute', top: 0, left: 0, zIndex: 5 }} className="plan-hero-goal-marker">
                            <div className="plan-hero-marker-dot" title="Drag to set goal" />
                            <span className="plan-hero-marker-label">Goal</span>
                        </motion.div>
                    </motion.div>
                    <div className="plan-hero-stats">
                        <span className="plan-hero-stat plan-hero-stat-done"><i className="fas fa-check-circle" /> {completedCount} of {totalCount} completed</span>
                        <span className="plan-hero-stat plan-hero-stat-time">Updated: Today, {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                </section>

                {/* --- 2. TEAM PERFORMANCE & EFFORT & GOALS (second section) --- */}
                <section className="plan-team-section plan-card plan-section-2">
                    <div className="plan-team-section-head">
                        <h2 className="plan-team-section-title">Team Performance & Effort & Goals</h2>
                        <button type="button" className="plan-btn-add-team" onClick={() => setShowAddTeamModal(true)}><i className="fas fa-plus" /> Add team</button>
                    </div>

                    {isSchemaError && (
                        <div className="plan-setup-message plan-setup-message-warning">
                            <p className="plan-setup-message-text">Team goals need database setup. Run the Plan tables migration in Supabase (<code>server/migrations/plan-tables.sql</code>) or ask your admin to reload the schema cache.</p>
                            <button type="button" className="btn btn-primary btn-sm rounded-pill" onClick={() => setShowAddTeamModal(true)}>Add team</button>
                        </div>
                    )}
                    {aggregatesError && !isSchemaError && (
                        <div className="plan-setup-message plan-setup-message-warning">
                            <p className="plan-setup-message-text">{aggregatesError}</p>
                            <button type="button" className="btn btn-outline-primary btn-sm rounded-pill" onClick={() => fetchAggregates()}>Retry</button>
                        </div>
                    )}
                    {!aggregatesError && aggregates.data.length === 0 && teams.length === 0 && !aggregatesLoading && (
                        <div className="plan-setup-message">
                            <p className="plan-setup-message-text">No teams yet. Add a team and set weekly targets to see performance and effort goals.</p>
                            <button type="button" className="plan-btn-add-team-large" onClick={() => setShowAddTeamModal(true)}>Add team</button>
                        </div>
                    )}
                    {!aggregatesError && (aggregates.data.length > 0 || teams.length > 0 || aggregatesLoading) && (
                        <>
                            {aggregatesLoading && (
                                <div className="plan-loading-inline">
                                    <span className="spinner-border spinner-border-sm text-primary me-2" role="status" />
                                    <span className="text-muted small">Loading live data from Meta…</span>
                                </div>
                            )}
                            <h3 className="plan-subsection-title"><i className="fas fa-users" /> Team list</h3>
                            <div className="plan-team-list-table-wrap">
                                <table className="plan-team-list-table">
                                    <thead>
                                        <tr>
                                            <th>Team name</th>
                                            <th>Page</th>
                                            <th className="plan-table-actions-col">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teams.map((t) => {
                                            const pageName = (pages.find((p) => p.id === t.page_id) || {}).name || t.page_id || '—';
                                            const aggItem = (aggregates.data || []).find((a) => a.team.id === t.id);
                                            return (
                                                <tr key={t.id}>
                                                    <td><strong>{t.name}</strong></td>
                                                    <td>{pageName}</td>
                                                    <td className="plan-table-actions-col">
                                                        <button type="button" className="plan-team-card-btn plan-team-card-btn-edit" onClick={() => aggItem ? openTargetsModal(aggItem) : openTargetsForTeam(t)} title="Set targets">Set targets</button>
                                                        <button type="button" className="plan-team-card-btn plan-team-card-btn-del" onClick={() => deleteTeam(t.id)} title="Remove team">Delete</button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <h3 className="plan-subsection-title"><i className="fas fa-chart-line" /> Weekly Progress Trends</h3>
                            {(() => {
                                const data = aggregates.data || [];
                                if (data.length === 0) return <p className="text-muted small">Set targets for teams to see progress trends.</p>;
                                const colors = ['#ef4444', '#eab308', '#22c55e', '#2563eb', '#8b5cf6'];
                                const weeks = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7'];
                                const teamProgress = data.map((item) => {
                                    const p = item.progressPct || {};
                                    const avg = (p.followers + p.ad_spend + p.organic_leads + p.organic_revenue + p.stories + p.reels + p.posts) / 7;
                                    return { name: item.team.name, current: Math.min(100, Math.round(avg)) };
                                });
                                const chartData = weeks.map((w, i) => {
                                    const point = { week: w };
                                    const ratio = (i + 1) / 7;
                                    teamProgress.forEach((t) => {
                                        point[t.name] = i === 6 ? t.current : Math.min(100, Math.max(0, Math.round(ratio * t.current)));
                                    });
                                    return point;
                                });
                                return (
                                    <div className="plan-weekly-trend-chart">
                                        <ResponsiveContainer width="100%" height={280}>
                                            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#64748b" />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#64748b" tickFormatter={(v) => `${v}%`} />
                                                <Tooltip formatter={(value) => [`${value}%`, 'Progress']} labelFormatter={(label) => `Week ${label}`} />
                                                <Legend />
                                                {teamProgress.map((t, i) => (
                                                    <Line key={t.name} type="monotone" dataKey={t.name} stroke={colors[i % colors.length]} strokeWidth={2} dot={{ r: 3 }} name={t.name} />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                );
                            })()}

                            <h3 className="plan-subsection-title"><i className="fas fa-table" /> Team Performance & Effort (table)</h3>
                            <div className="plan-performance-table-wrap">
                                <table className="plan-performance-table">
                                    <thead>
                                        <tr>
                                            <th>Team</th>
                                            <th>Followers</th>
                                            <th>Ad Spend</th>
                                            <th>Organic Leads</th>
                                            <th>Organic Revenue</th>
                                            <th>Stories</th>
                                            <th>Reels</th>
                                            <th>Posts</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(aggregates.data || []).map((item) => (
                                            <tr key={item.team.id}>
                                                <td><strong>{item.team.name}</strong></td>
                                                <td>{formatNum(item.achieved.followers)} / {formatNum(item.targets.followers)} <span className="text-muted">({item.progressPct.followers}%)</span></td>
                                                <td>{formatCurrency(item.achieved.ad_spend)} / {formatCurrency(item.targets.ad_spend)} <span className="text-muted">({item.progressPct.ad_spend}%)</span></td>
                                                <td>{item.achieved.organic_leads} / {item.targets.organic_leads} <span className="text-muted">({item.progressPct.organic_leads}%)</span></td>
                                                <td>{formatCurrency(item.achieved.organic_revenue)} / {formatCurrency(item.targets.organic_revenue)} <span className="text-muted">({item.progressPct.organic_revenue}%)</span></td>
                                                <td>{item.achieved.stories} / {item.targets.stories} <span className="text-muted">({item.progressPct.stories}%)</span></td>
                                                <td>{item.achieved.reels} / {item.targets.reels} <span className="text-muted">({item.progressPct.reels}%)</span></td>
                                                <td>{item.achieved.posts} / {item.targets.posts} <span className="text-muted">({item.progressPct.posts}%)</span></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {(!aggregates.data || aggregates.data.length === 0) && (
                                    <p className="text-muted small mb-0">Set weekly targets for teams to see performance data here.</p>
                                )}
                            </div>

                            <h3 className="plan-subsection-title"><i className="fas fa-wallet" /> Ad Spend Budget Forecast</h3>
                            <div className="plan-forecast-row">
                                <div className="plan-forecast-item">
                                    <span className="plan-forecast-label">Weekly Ad Spend Target</span>
                                    <span className="plan-forecast-value">{formatCurrency(aggregates.budgetForecast.weekly_ad_spend_target)}</span>
                                </div>
                                <div className="plan-forecast-item">
                                    <span className="plan-forecast-label">Actual Ad Spend</span>
                                    <span className="plan-forecast-value plan-forecast-value-primary">{formatCurrency(aggregates.budgetForecast.actual_ad_spend)}</span>
                                </div>
                                <div className="plan-forecast-item">
                                    <span className="plan-forecast-label">Remaining Budget</span>
                                    <span className="plan-forecast-value">{formatCurrency(aggregates.budgetForecast.remaining_budget)}</span>
                                </div>
                                <div className="plan-forecast-item">
                                    <span className="plan-forecast-label">Budget Forecast</span>
                                    <span className="plan-forecast-value">{formatCurrency(aggregates.budgetForecast.forecast_ad_spend)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </section>

            {/* Add Team Modal */}
            {showAddTeamModal && (
                <div className="modal show d-block plan-modal-backdrop" tabIndex="-1" onClick={() => { setShowAddTeamModal(false); setAddTeamError(null); }}>
                    <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-content rounded-3">
                            <form onSubmit={saveNewTeam}>
                                <div className="modal-header">
                                    <h5 className="modal-title">Add team</h5>
                                    <button type="button" className="btn-close" onClick={() => { setShowAddTeamModal(false); setAddTeamError(null); }} aria-label="Close"></button>
                                </div>
                                <div className="modal-body">
                                    {addTeamError && (
                                        <div className="alert alert-danger py-2 mb-3" role="alert">
                                            <strong>Couldn&apos;t add team</strong>
                                            <p className="mb-1 mt-1 small">{addTeamError}</p>
                                            {(addTeamError.includes('plan_teams') || addTeamError.includes('schema cache')) && (
                                                <div className="mt-2 pt-2 border-top border-danger border-opacity-25">
                                                    <strong className="small">How to fix:</strong>
                                                    <ol className="small mb-0 ps-3 mt-1">
                                                        <li>Open Supabase Dashboard → <strong>SQL Editor</strong> → New query.</li>
                                                        <li>Copy all of <code>server/migrations/plan-tables.sql</code> from this project, paste, and click <strong>Run</strong>.</li>
                                                        <li>Go to <strong>Settings → API</strong>, scroll to Schema, click <strong>Reload schema</strong>.</li>
                                                        <li>Wait 30 seconds, then click <strong>Try again</strong> below.</li>
                                                    </ol>
                                                    <button type="button" className="btn btn-sm btn-outline-danger mt-2" onClick={() => { setAddTeamError(null); saveNewTeam(); }} disabled={savingTeam || !(newTeam.name || '').trim()}>
                                                        {savingTeam ? 'Saving…' : 'Try again'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <div className="mb-3">
                                        <label className="form-label">Team name</label>
                                        <input type="text" className="form-control" placeholder="e.g. Team 1" value={newTeam.name} onChange={(e) => setNewTeam(prev => ({ ...prev, name: e.target.value }))} autoFocus />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label">Page (optional – for followers & content counts)</label>
                                        <select className="form-select" value={newTeam.page_id} onChange={(e) => setNewTeam(prev => ({ ...prev, page_id: e.target.value }))}>
                                            <option value="">— Select page —</option>
                                            {pages.map((p) => (
                                                <option key={p.id} value={p.id}>{p.name || p.id}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-secondary" onClick={() => { setShowAddTeamModal(false); setAddTeamError(null); }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" disabled={savingTeam || !(newTeam.name || '').trim()}>
                                        {savingTeam ? 'Saving…' : 'Add team'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Set Targets Modal */}
            {showTargetsModal && (
                <div className="modal show d-block plan-modal-backdrop" tabIndex="-1">
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-3">
                            <div className="modal-header">
                                <h5 className="modal-title">Set weekly targets</h5>
                                <button type="button" className="btn-close" onClick={() => setShowTargetsModal(false)}></button>
                            </div>
                            <div className="modal-body">
                                <p className="text-muted small mb-3">Week starting {weekStart}. Enter targets for this team.</p>
                                <div className="row g-2">
                                    <div className="col-6">
                                        <label className="form-label small">Followers</label>
                                        <input type="number" className="form-control form-control-sm" min="0" value={targetsForm.target_followers} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_followers: e.target.value }))} />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Ad Spend</label>
                                        <input type="number" className="form-control form-control-sm" min="0" step="0.01" value={targetsForm.target_ad_spend} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_ad_spend: e.target.value }))} />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Organic Leads</label>
                                        <input type="number" className="form-control form-control-sm" min="0" value={targetsForm.target_organic_leads} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_organic_leads: e.target.value }))} />
                                    </div>
                                    <div className="col-6">
                                        <label className="form-label small">Organic Revenue</label>
                                        <input type="number" className="form-control form-control-sm" min="0" step="0.01" value={targetsForm.target_organic_revenue} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_organic_revenue: e.target.value }))} />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label small">Stories</label>
                                        <input type="number" className="form-control form-control-sm" min="0" value={targetsForm.target_stories} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_stories: e.target.value }))} />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label small">Reels</label>
                                        <input type="number" className="form-control form-control-sm" min="0" value={targetsForm.target_reels} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_reels: e.target.value }))} />
                                    </div>
                                    <div className="col-4">
                                        <label className="form-label small">Posts</label>
                                        <input type="number" className="form-control form-control-sm" min="0" value={targetsForm.target_posts} onChange={(e) => setTargetsForm(prev => ({ ...prev, target_posts: e.target.value }))} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowTargetsModal(false)}>Cancel</button>
                                <button type="button" className="btn btn-primary" onClick={saveTargets} disabled={savingTargets}>{savingTargets ? 'Saving…' : 'Save targets'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

                {/* --- PRIORITIZE YOUR TASKS --- */}
                <section className="plan-tasks-section plan-card">
                    <h2 className="plan-tasks-title"><i className="fas fa-sort" /> Prioritize your tasks</h2>
                    <Reorder.Group axis="y" values={tasks} onReorder={setTasks} className="plan-task-list">
                <AnimatePresence>
                    {tasks.map((task) => (
                        <Reorder.Item key={task.id} value={task} className="plan-task-item">
                            <motion.div
                                variants={itemVariants}
                                layoutId={task.id}
                                whileHover={{ scale: 1.01, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
                                whileTap={{ scale: 0.99 }}
                                className="plan-task-card"
                            >
                                <div className="plan-task-card-inner">

                                    <div className="plan-task-left">
                                        <div className="plan-task-drag d-none d-md-flex"><i className="fas fa-grip-lines" /></div>
                                        <div className="plan-task-icon-wrap">
                                            <div className="plan-task-icon"><i className={task.icon} /></div>
                                            {task.platformIcon && <div className="plan-task-platform" style={{ background: task.platformColor }}><i className={task.platformIcon} /></div>}
                                        </div>
                                        <div className="plan-task-info">
                                            <h5 className="plan-task-title">{task.title}</h5>
                                            <p className="plan-task-subtitle">{task.subtitle || 'Recommended task'}</p>
                                        </div>
                                    </div>
                                    <div className="plan-task-right">
                                        {!task.isCompleted && (
                                            <div className="plan-task-progress-wrap">
                                                <span className="plan-task-progress-text">{task.current}/{task.target} {task.unit}</span>
                                                <div className="plan-task-progress-bar">
                                                    <motion.div className="plan-task-progress-fill" initial={{ width: 0 }} whileInView={{ width: `${(task.current / task.target) * 100}%` }} />
                                                </div>
                                            </div>
                                        )}
                                        {task.isCompleted ? (
                                            <span className="plan-task-done"><i className="fas fa-check" /> Done</span>
                                        ) : (
                                            <motion.div role="button" className="plan-task-action" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>{task.btnText || 'View'}</motion.div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        </Reorder.Item>
                    ))}
                </AnimatePresence>
            </Reorder.Group>
                    <p className="plan-footer-text">Keep going! You're doing great.</p>
                </section>
            </div>
        </div>
    );
}
