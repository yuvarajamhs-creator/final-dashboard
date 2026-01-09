import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { auth } from "../../utils/auth";


const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:4000";
const STORAGE_KEY =
  "59ca69f53c01829c41b079fb15fb5b9bc7ed726f15afdc9da7e57f83543fca15a06130d30bbf6744243d936c7b19d494353d7a55e742b0404ebd6c4704efd50c";

export default function Signup() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const buildSignupUrl = () => {
    if (typeof API_BASE === "string" && API_BASE.trim() !== "") {
      return API_BASE.replace(/\/+$/g, "") + "/api/auth/signup";
    }
    return "/api/auth/signup";
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username || !password || !confirm) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildSignupUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password, fullName }),
      });

      let payload = {};
      try {
        payload = await res.json();
      } catch {
        payload = {};
      }

      if (!res.ok) {
        setError(payload?.error || payload?.message || "Signup failed");
        return;
      }

      const token = payload?.token;
      const user = payload?.user;

      if (!token) {
        setError("Signup failed: no token returned");
        return;
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      } catch {}

      try {
        if (auth && typeof auth.login === "function") {
          auth.login(token, user);
        }
      } catch {}

      navigate("/");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-hero vh-100 d-flex align-items-stretch">
      <div
        className="d-none d-md-flex col-md-7 login-left align-items-center"
        style={{
          backgroundImage:
            "url('/health-background-medical-banner-with-cardiogram-line-vector.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="login-left-inner text-white px-5">
          <h1 className="display-3 fw-bold">Welcome<br />Back</h1>
          <p className="lead text-white-50 mt-3">
            It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout.
          </p>
          <div className="social-icons mt-4">
            <a href="#!" className="me-3 text-white social-btn"><i className="fa-brands fa-facebook"></i></a>
            <a href="#!" className="me-3 text-white social-btn"><i className="fa-brands fa-twitter"></i></a>
            <a href="#!" className="me-3 text-white social-btn"><i className="fa-brands fa-instagram"></i></a>
            <a href="#!" className="text-white social-btn"><i className="fa-brands fa-youtube"></i></a>
          </div>
        </div>
      </div>

      <div className="col-12 col-md-5 d-flex align-items-center justify-content-center login-right">
        <div className="w-100" style={{ maxWidth: "480px" }}>
          <div className="card login-card shadow-sm p-4">
            <div className="text-center mb-4">
              <h2 className="h4 fw-semibold">Create your account</h2>
              <p className="text-muted small mt-1">Enter details to create a new account</p>
            </div>

            {error && <div className="alert alert-danger small" role="alert">{error}</div>}

            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-3">
                <label htmlFor="signupFullName" className="form-label small">Full Name (optional)</label>
                <input
                  id="signupFullName"
                  type="text"
                  className="form-control"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={loading}
                  placeholder="John Doe"
                />
              </div>

              <div className="mb-3">
                <label htmlFor="signupEmail" className="form-label small">Email</label>
                <input
                  id="signupEmail"
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
                <label htmlFor="signupPassword" className="form-label small">Password</label>
                <input
                  id="signupPassword"
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                />
              </div>

              <div className="mb-3">
                <label htmlFor="signupConfirm" className="form-label small">Confirm Password</label>
                <input
                  id="signupConfirm"
                  type="password"
                  className="form-control"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="••••••••"
                />
              </div>

              <div className="d-flex justify-content-between align-items-center mb-3">
                <button className="btn btn-primary" disabled={loading}>
                  {loading ? "Creating…" : "Sign Up"}
                </button>
                <Link to="/login" className="small">Back to Login</Link>
              </div>

              <div className="text-center position-relative my-3">
                <hr />
                <span className="position-absolute top-50 start-50 translate-middle px-2 bg-white small text-muted">
                  Or continue with
                </span>
              </div>

              <div className="d-flex gap-2 mb-3">
                <button type="button" className="btn btn-outline-secondary w-50">
                  <i className="fa-brands fa-google me-2"></i>Google
                </button>
                <button type="button" className="btn btn-outline-secondary w-50">
                  <i className="fa-brands fa-facebook me-2"></i>Facebook
                </button>
              </div>

              <p className="text-center small text-muted mb-0">
                By creating an account you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
              </p>
            </form>
          </div>

          <div className="text-center small text-muted mt-3 d-md-none">
            Need help? <Link to="/support">Contact support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
