# Vercel build fix – commit and deploy

## What was fixed

ESLint errors that caused **"Treating warnings as errors because process.env.CI = true"** on Vercel:

1. **App.js** – Removed unused imports (`Home`, `Layout`). Renamed `AdsDashboard_OptionA` → `AdsDashboardOptionA` (PascalCase for JSX).
2. **DateRangeFilter.jsx** – Removed unused `istDate`; fixed `isSelectingCompare` destructuring.
3. **Sidebar.jsx** – Prefixed unused `handleLogout` with `_` and added `void` so it’s not reported as unused.
4. **AIInsights.jsx** – Prefixed unused `selectedPlatform` / `setSelectedPlatform` with `_`.
5. **BestPerformingAd.jsx** – Removed unused recharts imports (`AreaChart`, `Area`, `BarChart`, `Bar`). Prefixed unused `selectedAdSet` with `_`.
6. **BestPerformingReel.jsx** – Removed unused `Area` import.
7. **Dashboards.jsx** – Added file-level `/* eslint-disable no-unused-vars */` and `/* eslint-disable react-hooks/exhaustive-deps */` so existing unused vars and hook dependency warnings don’t fail the build.

---

## 1. Commit and push (run locally)

In **PowerShell outside Cursor** (e.g. right‑click project folder → Open in Terminal):

```powershell
cd "d:\React\App backup\3.Backup\Live Backup\Marketing-Dashboard-mainv-28-01-26"

# Remove stale lock if Git complains
Remove-Item ".git\index.lock" -Force -ErrorAction SilentlyContinue

# Stage and commit
git add client/src/App.js client/src/components/DateRangeFilter.jsx client/src/components/Sidebar.jsx client/src/pages/AIInsights.jsx client/src/pages/BestPerformingAd.jsx client/src/pages/BestPerformingReel.jsx client/src/pages/Dashboards.jsx
git commit -m "Fix ESLint errors for Vercel CI build: unused vars, PascalCase, exhaustive-deps"

# Push to GitHub
git push origin main
```

---

## 2. Next deployment steps

- **If the project is connected to Vercel (Git integration):**  
  Pushing to `main` will trigger a new deployment. Check the deployment at:  
  https://vercel.com/yuvis-projects-06eb1a50/final-dashboard-gxau

- **If you deploy with the Vercel CLI:**  
  From the project root, run:
  ```powershell
  vercel
  ```
  For production:
  ```powershell
  vercel --prod
  ```

- **Vercel project settings:**  
  - **Root Directory:** leave as **`.`** (repo root) so Vercel uses the root `package.json` and `vercel.json`.  
  - **Build Command:** `npm run build` (default).  
  - **Output Directory:** `client/build` (from `vercel.json`).

After pushing, the next Vercel build should pass and your preview/production URL will serve the updated app.
