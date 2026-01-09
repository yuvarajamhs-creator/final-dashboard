import React, { useState, useRef, useEffect } from 'react';
import { motion, Reorder, useMotionValue, AnimatePresence } from 'framer-motion';
import './Plan.css';

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

    return (
        <div className="container-fluid py-4 min-vh-100 bg-light-gray">

            {/* --- HEADER --- */}
            <div className="row mb-5">
                <div className="col-12">
                    <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-3">
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="d-flex align-items-center gap-3"
                        >
                            <h2 className="fw-900 mb-0 text-dark-blue display-6">Weekly Plan</h2>
                        </motion.div>

                        {/* --- DATE FILTER DROPDOWN --- */}
                        <div className="dropdown">
                            <div
                                className="d-flex align-items-center gap-2 px-3 py-2 bg-white border shadow-sm dropdown-toggle cursor-pointer"
                                role="button"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                style={{
                                    borderRadius: '8px',
                                    color: '#64748b',
                                    borderColor: '#cbd5e1',
                                    transition: 'all 0.2s ease',
                                    minWidth: '280px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#94a3b8'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
                            >
                                <i className="far fa-calendar-alt text-secondary opacity-75"></i>
                                <span className="fw-medium small text-dark flex-grow-1 text-center" style={{ fontSize: '0.9rem' }}>
                                    {selectedDateRange.includes(':') ? selectedDateRange : `${filters.startDate ? 'Custom' : 'Select Date'}: ${selectedDateRange}`}
                                </span>
                                <i className="fas fa-chevron-down text-secondary opacity-50 small"></i>
                            </div>

                            {/* Dropdown Content */}
                            <ul className="dropdown-menu dropdown-menu-end shadow-lg border-0 rounded-3 p-3 mt-2" style={{ minWidth: '340px', backgroundColor: '#ffffff' }}>

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
                                                const startDisplay = filters.startDate ? new Date(filters.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...';
                                                const endDisplay = filters.endDate ? new Date(filters.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...';
                                                setSelectedDateRange(`Custom: ${startDisplay} - ${endDisplay}`);
                                            }}
                                        >
                                            Apply Range
                                        </button>
                                    </div>
                                </div>
                            </ul>
                        </div>
                    </div>

                    <p className="text-secondary mb-4 fs-5">Maximize your audience reach by hitting your targets!</p>

                    {/* Dynamic Goal Header */}
                    <div className="d-flex align-items-center gap-2 mb-4">
                        <h4 className="fw-bold text-dark mb-0">Complete at least</h4>
                        <motion.span
                            key={goalTasks}
                            initial={{ scale: 1.5, color: '#2ecc71' }}
                            animate={{ scale: 1, color: '#1877f2' }}
                            className="fs-3 fw-900 text-primary px-2"
                        >
                            {goalTasks}
                        </motion.span>
                        <h4 className="fw-bold text-dark mb-0">tasks to win 🏆</h4>
                    </div>

                    {/* INTERACTIVE PROGRESS BAR */}
                    <motion.div
                        className="position-relative mb-4 mt-2 p-1"
                        style={{ maxWidth: '100%', height: '50px' }}
                        ref={progressBarRef}
                        whileHover={{ scale: 1.01 }}
                    >
                        {/* Track */}
                        <div className="progress w-100 shadow-sm" style={{ height: '12px', backgroundColor: '#e4e6eb', borderRadius: '20px', overflow: 'visible', top: '14px', position: 'relative' }}>
                            {/* Green Progress Fill */}
                            <motion.div
                                className="progress-bar rounded-pill"
                                initial={{ width: 0 }}
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 1.2, ease: "easeOut" }}
                                style={{ backgroundColor: '#00c853', zIndex: 1, boxShadow: '0 2px 5px rgba(0,200,83,0.3)' }}
                            />
                        </div>

                        {/* Draggable Goal Marker */}
                        <motion.div
                            drag="x"
                            dragConstraints={progressBarRef}
                            dragElastic={0.05}
                            dragMomentum={false}
                            onDrag={handleDrag}
                            whileHover={{ scale: 1.1, cursor: 'grab' }}
                            whileTap={{ cursor: 'grabbing', scale: 1.05 }}
                            style={{ x, position: 'absolute', top: '-5px', zIndex: 10, touchAction: 'none' }}
                        >
                            {/* The Handle */}
                            <div className="goal-marker shadow-lg d-flex flex-column align-items-center">
                                <div className="marker-line"></div>
                                <div className="marker-knob">
                                    <i className="fas fa-bullseye text-white custom-icon-size"></i>
                                </div>
                                <div className="marker-label">Goal</div>
                            </div>
                        </motion.div>
                    </motion.div>

                    {/* Stats Row */}
                    <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 text-muted fw-medium mt-3">
                        <div className="d-flex align-items-center gap-2">
                            <i className="fas fa-check-circle text-success fs-5"></i>
                            <span className="text-dark fs-6">{completedCount} of {totalCount} completed</span>
                        </div>
                        <div className="d-flex align-items-center gap-2 bg-white px-3 py-1 rounded-pill shadow-sm border small">
                            <div className="spinner-grow spinner-grow-sm text-primary" role="status"></div>
                            <span>Updated: Today, {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                    </div>
                </div>
            </div>

            <hr className="my-5 text-muted opacity-10" />

            {/* --- TASK LIST --- */}
            <div className="d-flex justify-content-between align-items-center mb-3 px-2">
                <h6 className="text-uppercase text-secondary fw-bold small ls-1">
                    <i className="fas fa-sort me-2"></i>Prioritize your tasks
                </h6>
            </div>

            <Reorder.Group axis="y" values={tasks} onReorder={setTasks} className="list-group list-group-flush gap-3">
                <AnimatePresence>
                    {tasks.map((task) => (
                        <Reorder.Item key={task.id} value={task} className="border-0 p-0 bg-transparent">
                            <motion.div
                                variants={itemVariants}
                                layoutId={task.id}
                                whileHover={{ scale: 1.01, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)" }}
                                whileTap={{ scale: 0.99 }}
                                className="card border-0 shadow-sm rounded-4 overflow-hidden task-card-interactive"
                            >
                                <div className="card-body p-3 p-md-4 d-flex flex-column flex-md-row align-items-md-center gap-3">

                                    {/* 1. Header: Drag + Icon + Title (Mobile: Top Row) */}
                                    <div className="d-flex align-items-center flex-grow-1 gap-3">
                                        <div className="drag-handle text-muted opacity-25 d-none d-md-block" style={{ cursor: 'grab' }}>
                                            <i className="fas fa-grip-lines fa-lg"></i>
                                        </div>

                                        <div className="position-relative flex-shrink-0">
                                            <div className="icon-box-lg rounded-circle d-flex align-items-center justify-content-center shadow-inner">
                                                <i className={`${task.icon} text-primary fs-4`}></i>
                                            </div>
                                            {task.platformIcon && (
                                                <div className="platform-badge" style={{ background: task.platformColor }}>
                                                    <i className={task.platformIcon}></i>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-grow-1 min-w-0">
                                            <h5 className="fw-bold text-dark mb-1 text-truncate">{task.title}</h5>
                                            <div className="d-flex align-items-center text-muted small">
                                                <i className="fas fa-info-circle me-1 opacity-50"></i>
                                                <span className="text-truncate">{task.subtitle || "Recommended task"}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Action: Progress + Button (Mobile: Bottom Row or Stacked) */}
                                    <div className="d-flex align-items-center justify-content-between justify-content-md-end gap-3 mt-3 mt-md-0 w-100-mobile">

                                        {!task.isCompleted && (
                                            <div className="d-flex flex-column align-items-end flex-grow-1 flex-md-grow-0" style={{ minWidth: '120px' }}>
                                                <div className="d-flex justify-content-between w-100 mb-1">
                                                    <span className="fw-bold text-dark small">{task.current}/{task.target}</span>
                                                    <span className="text-muted small ms-2">{task.unit}</span>
                                                </div>
                                                <div className="progress w-100" style={{ height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px' }}>
                                                    <motion.div
                                                        className="progress-bar rounded-pill"
                                                        initial={{ width: 0 }}
                                                        whileInView={{ width: `${(task.current / task.target) * 100}%` }}
                                                        style={{ backgroundColor: '#1877f2' }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-shrink-0">
                                            {task.isCompleted ? (
                                                <div className="badge bg-success-subtle text-success border border-success px-3 py-2 rounded-pill fw-bold d-flex align-items-center gap-2">
                                                    <i className="fas fa-check"></i> Done
                                                </div>
                                            ) : (
                                                /* CHANGED TO MOTION.DIV to bypass global BUTTON styles */
                                                <motion.div
                                                    whileHover={{ scale: 1.05, backgroundColor: "#1877f2", color: "#fff" }}
                                                    whileTap={{ scale: 0.95 }}
                                                    role="button"
                                                    className="rounded-pill px-4 py-2 fw-bold border-2 text-center"
                                                    style={{
                                                        backgroundColor: 'transparent',
                                                        color: '#1877f2',
                                                        border: '2px solid #1877f2',
                                                        cursor: 'pointer',
                                                        minWidth: '100px'
                                                    }}
                                                >
                                                    {task.btnText || "View"}
                                                </motion.div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </motion.div>
                        </Reorder.Item>
                    ))}
                </AnimatePresence>
            </Reorder.Group>

            <div className="text-center mt-5 mb-5 pb-5">
                <p className="text-muted small">🎉 Keep going! You're doing great.</p>
            </div>
        </div>
    );
}
