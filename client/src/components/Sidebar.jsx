import React, { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../utils/auth";
import { setTheme, getCurrentTheme } from "../utils/theme";
import logo from "../assets/MHS_Log.png"; // Import the logo

export default function Layout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setCurrentTheme] = useState(getCurrentTheme());

  useEffect(() => {
    setTheme(theme);
  }, [theme]);

  const handleLogout = () => {
    auth.logout();
    navigate("/login");
  };

  return (
    <div
      className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"
        }`}
    >
      {/* SIDEBAR */}
      <aside
        className={`sidebar text-white shadow-lg ${sidebarOpen ? "open" : "closed"
          }`}
      >
        <div className="p-3 border-bottom border-white-10 d-flex justify-content-between align-items-center branding-header">
          <Link
            to="/"
            className="text-white text-decoration-none fw-bold d-flex align-items-center gap-2 branding-link"
            onClick={() => {
              if (window.innerWidth < 992) setSidebarOpen(false);
            }}
          >
            {/* Logo Image */}
            <img src={logo} alt="MHS Logo" className="sidebar-logo" />
            <span className="brand-text">MHS Dashboard</span>
          </Link>

          <button
            className="btn btn-sm btn-icon d-lg-none text-white-50"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <ul className="nav flex-column px-2 pt-3 custom-nav">
          {/* 1. Dashboard */}
          <li className="nav-item mb-2">
            <NavLink
              end
              to="/"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">📊</span>
              <span>Dashboard</span>
            </NavLink>
          </li>

          {/* 2. Best Performing Ad */}
          <li className="nav-item mb-2">
            <NavLink
              to="/best-ad"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">⭐</span>
              <span>Best Performing Ad</span>
            </NavLink>
          </li>

          {/* 3. Best Performing Reel */}
          <li className="nav-item mb-2">
            <NavLink
              to="/best-reel"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">🎬</span>
              <span>Best Performing Reel</span>
            </NavLink>
          </li>

          {/* 4. Plan */}
          <li className="nav-item mb-2">
            <NavLink
              to="/plan"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">🗓️</span>
              <span>Plan</span>
            </NavLink>
          </li>

          {/* 5. Audience */}
          <li className="nav-item mb-2">
            <NavLink
              to="/audience"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">👥</span>
              <span>Audience</span>
            </NavLink>
          </li>

          {/* 6. AI Insights */}
          <li className="nav-item mb-2">
            <NavLink
              to="/ai-insights"
              className="nav-link sidebar-link d-flex align-items-center ai-link"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">🤖</span>
              <span>AI Insights</span>
            </NavLink>
          </li>

          {/* 7. Meta Settings */}
          <li className="nav-item mb-2">
            <NavLink
              to="/meta-settings"
              className="nav-link sidebar-link d-flex align-items-center"
              onClick={() => {
                if (window.innerWidth < 992) setSidebarOpen(false);
              }}
            >
              <span className="icon-wrapper me-3">🔐</span>
              <span>Meta Settings</span>
            </NavLink>
          </li>
        </ul>
      </aside>

      {sidebarOpen && (
        <div
          className="sidebar-backdrop d-lg-none"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN AREA */}
      <div className="main-area d-flex flex-column">
        {/* TOPBAR */}
        <header className="custom-header-style d-flex justify-content-between align-items-center px-4 py-3 border-bottom bg-white shadow-sm">
          <div className="d-flex align-items-center gap-3">
            <button
              className="btn btn-light btn-sm rounded-circle p-2"
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              ☰
            </button>
            <h5 className="mb-0 fw-bold text-dark d-none d-sm-block">
              {location.pathname === '/' ? 'Dashboard'
                : location.pathname.substring(1).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </h5>
          </div>

          <div className="d-flex align-items-center gap-3">
            <select
              className="form-select form-select-sm w-auto border-0 bg-light fw-medium"
              value={theme}
              onChange={(e) => setCurrentTheme(e.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button
              className="btn btn-danger btn-sm px-3 rounded-pill"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </header>

        {/* 👇 Only this scrolls */}
        <main className="layout-content flex-grow-1 p-4 bg-light-subtle">{children}</main>
      </div>

      {/* STYLES */}
      <style jsx="true">{`
        /* Core Reset */
        html, body, #root { height: 100%; }
        body { margin: 0; overflow: hidden; background-color: #f3f4f6; font-family: 'Inter', sans-serif; }
        
        /* Layout Structure */
        .app-shell { height: 100vh; display: flex; background-color: #f3f4f6; }
        .main-area { flex: 1; display: flex; flex-direction: column; min-height: 0; background-color: #f3f4f6; }
        .layout-content { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 2rem; }

        /* Sidebar Styling */
        .sidebar {
            background: #0f2d5e; /* Dark Navy Blue from reference */
            transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
            overflow-y: auto;
            overflow-x: hidden;
            z-index: 1000;
            border-right: 1px solid rgba(255,255,255,0.05);
        }
        
        .sidebar-logo {
            height: 32px;
            width: auto;
            object-fit: contain;
        }
        
        .brand-text {
            font-size: 1.1rem;
            letter-spacing: 0.5px;
        }

        .border-white-10 { border-color: rgba(255,255,255,0.1) !important; }
        
        .sidebar.open { box-shadow: 4px 0 24px rgba(0,0,0,0.1); }
        .sidebar.closed { box-shadow: none; }

        .sidebar-link {
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 0.95rem;
          color: rgba(255,255,255,0.7) !important;
          transition: all 0.2s ease;
          margin-bottom: 4px;
          border: 1px solid transparent;
        }

        .sidebar-link:hover {
          background-color: rgba(255, 255, 255, 0.08);
          color: #fff !important;
          padding-left: 20px;
        }

        .nav-link.active, .active-parent {
          background: linear-gradient(90deg, rgba(59, 130, 246, 0.2), rgba(37, 99, 235, 0.1));
          border: 1px solid rgba(59, 130, 246, 0.4);
          color: #fff !important;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.1);
        }
        
        /* Special AI Link Style */
        .ai-link.active {
             background: linear-gradient(90deg, rgba(139, 92, 246, 0.2), rgba(217, 70, 239, 0.1));
             border-color: rgba(168, 85, 247, 0.4);
             box-shadow: 0 0 15px rgba(168, 85, 247, 0.2);
        }

        .icon-wrapper {
            width: 24px;
            text-align: center;
            display: inline-block;
            font-size: 1.1rem;
        }

        /* Submenu */
        .submenu-link { font-size: 0.85rem; padding-left: 12px; }
        .animate-submenu { animation: slideDown 0.2s ease-out; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

        /* Responsive */
        @media (min-width: 992px) {
          .sidebar { position: relative; height: 100vh; }
          .sidebar.open { width: 260px; }
          .sidebar.closed { width: 0; border: none; }
        }

        @media (max-width: 991.98px) {
          .app-shell { position: relative; }
          .sidebar { position: fixed; top: 0; left: 0; height: 100%; width: 260px; transform: translateX(-100%); }
          .sidebar.open { transform: translateX(0); }
          .sidebar.closed { transform: translateX(-100%); }
          .sidebar-backdrop { position: fixed; inset: 0; background-color: rgba(0, 0, 0, 0.5); z-index: 900; animation: fadeIn 0.2s ease; }
        }
        
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
