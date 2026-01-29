# Vercel build fix – commit, push, and deploy

## What was fixed

- **ESLint:** Unused vars, PascalCase (AdsDashboardOptionA), exhaustive-deps in App.js, DateRangeFilter, Sidebar, AIInsights, BestPerformingAd, BestPerformingReel, Dashboards.jsx.
- **Build:** Root `package.json` and **server** `package.json` both have a `build` script so Vercel works whether **Root Directory** is `.` (repo root) or `server`.
- **Missing script: build:** Added `build` script in `server/package.json` and `server/vercel.json` so when Vercel uses `server` as root, it builds the client and serves from `client/build`.

---

## Run these steps in order (PowerShell outside Cursor)

**1. Open Terminal**  
Right‑click the project folder → **Open in Terminal** (or open PowerShell and `cd` to the project).

**2. Remove stale Git lock (if needed)**  
```powershell
cd "d:\React\App backup\3.Backup\Live Backup\Marketing-Dashboard-mainv-28-01-26"
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue
```

**3. Stage, commit, and push to GitHub**  
```powershell
git add package.json vercel.json server/package.json server/vercel.json client/src/App.js client/src/components/DateRangeFilter.jsx client/src/components/Sidebar.jsx client/src/pages/AIInsights.jsx client/src/pages/BestPerformingAd.jsx client/src/pages/BestPerformingReel.jsx client/src/pages/Dashboards.jsx VERCEL_DEPLOY_STEPS.md
git commit -m "Fix Vercel Missing script build: add build in server/package.json and server/vercel.json"
git push origin main
```

**4. Deploy with Vercel CLI**  
From the same project root:

- **Preview deployment:**  
  ```powershell
  vercel
  ```
- **Production deployment:**  
  ```powershell
  vercel --prod
  ```

If the project is connected to Vercel via Git, pushing to `main` may already trigger a deployment; check:  
https://vercel.com/yuvis-projects-06eb1a50/final-dashboard-gxau

**5. Vercel project settings**  
- **Root Directory:** Either `.` (repo root) or `server` — both work now.  
- **Build Command:** `npm run build`  
- **Output Directory:** `client/build` (or `../client/build` when root is `server`, from `server/vercel.json`)
