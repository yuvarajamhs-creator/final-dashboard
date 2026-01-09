import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../utils/auth";

const API_BASE = process.env.REACT_APP_API_BASE || "";
const STORAGE_KEY = process.env.REACT_APP_STORAGE_KEY || "app_auth";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("thamilarasu.mhs@gmail.com");
  const [password, setPassword] = useState("Admin");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const buildLoginUrl = () => {
    if (typeof API_BASE === "string" && API_BASE.trim() !== "") {
      return API_BASE.replace(/\/+$/g, "") + "/api/auth/login";
    }
    return "/api/auth/login";
  };
   const handleClick = () => {
    window.location.href = 'https://www.google.com'; 
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const email = String(username || "").trim();
    const pw = String(password || "");

    if (!email || !pw) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildLoginUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: pw }),
      });

      let payload = {};
      try {
        payload = await res.json();
      } catch (err) {
        payload = {};
      }

      if (!res.ok) {
        setError(payload?.error || payload?.message || "Invalid credentials");
        return;
      }

      const token = payload?.token;
      const user = payload?.user;

      if (!token) {
        setError("Login failed: no token received");
        return;
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      } catch (err) {}

      try {
        if (auth && typeof auth.login === "function") {
          auth.login(token, user);
        }
      } catch (err) {}

      navigate("/");
    } catch (err) {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-fluid vh-100 d-flex p-0">
      <div
        className="d-none d-md-flex col-md-6 bg-dark text-white align-items-center justify-content-center p-5"
        style={{
          backgroundImage: "url('/health-background-medical-banner-with-cardiogram-line-vector.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="login-bg  bg-opacity-50 p-4 rounded">
          <h1 className="display-5 fw-bold mb-3">Welcome back</h1>
          <p>Sign in to continue to your dashboard and manage your projects.</p>
          <ul className="mt-3">
            <li>Fast, secure access</li>
            <li>Saved sessions & preferences</li>
            <li>Two-factor ready</li>
          </ul>
        </div>
      </div>

      <div className="col-12 col-md-6 d-flex align-items-center justify-content-center bg-light p-4">
        <div className="w-100" style={{ maxWidth: "400px" }}>
          <div className="card shadow-sm p-4">
            <div className="text-center mb-4">
              <h2 className="fw-semibold">Sign in to your account</h2>
              <p className="text-muted small mt-1">Enter your email and password to continue</p>
            </div>

            {error && (
              <div className="alert alert-danger small" role="alert">{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="you@example.com"
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                />
              </div>

              <div className="d-flex justify-content-between align-items-center mb-3">
                <button className="btn btn-primary" disabled={loading}>
                  {loading ? "Signing in…" : "Login"}
                </button>
                <Link to="/signup" className="small">
                  Create account
                </Link>
              </div>

              <div className="text-center position-relative my-3">
                <hr />
                <span className="position-absolute top-50 start-50 translate-middle px-2 bg-white small text-muted">
                  Or continue with
                </span>
              </div>

              <div className="d-flex gap-2">
                <i onClick={handleClick} className="fa-brands fa-google fs-5" ></i>
                <i class="fa-brands fa-facebook fs-5"></i>
                <i class="fa-brands fa-square-instagram fs-5"></i>
              </div>
            </form>

            <p className="text-center small text-muted mt-4">
              By signing in you agree to our <Link to="/terms">Terms</Link>.
            </p>
          </div>

          <div className="text-center small text-muted mt-3">
            Need help? <Link to="/support">Contact support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}