# AI Insights Features – Brief Documentation

This document briefly describes three AI Insights features: **Lead Saturation Detection**, **Creative Fatigue Detection**, and **Lead Intelligence**. All three are available on the **AI Insights** page in the Marketing Dashboard.

---

## 1. Lead Saturation Detection

**Purpose:** Detect when lead volume or quality is plateauing so you can adjust targeting or creative.

**Workflow:**
- User clicks **Run analysis** on the AI Insights page.
- Backend runs analysis for a date range (default: last 7 days vs previous 7 days).
- Meta campaign-level insights and Leads duplicate rates are fetched; each campaign gets a **Score** and **Status**.
- Results are shown as a summary (saturation level, counts) and a table per campaign.

**Metrics:**

| Metric       | How it's calculated |
|-------------|----------------------|
| **Frequency** | From Meta: `impressions ÷ reach` for the current period (avg times each user saw the campaign). |
| **CPL**       | From Meta: `spend ÷ leads` for the current period (cost per lead). |
| **Duplicate %** | From your Leads DB: same phone appearing more than once per campaign in the period; rate = (total − unique phones) ÷ total, shown as %. |
| **Score**      | Rule-based: Frequency > 3 (+30), CPL increase > 30% (+25), lead drop > 25% (+25), Duplicate % > 20% (+20). Max 100. |
| **Status**     | **Healthy** (score < 40), **Warning** (40–60), **Saturated** (score > 60). |

**Saturation level (summary):** **high** if any campaign is Saturated; **medium** if any is Warning; **low** otherwise.

**Backend:** `server/services/saturationService.js`, `server/routes/aiInsights.js` (POST `/api/ai/lead-saturation`). Optional logging to `campaign_saturation_log`.

---

## 2. Creative Fatigue Detection

**Purpose:** Detect when ad creatives stop performing (high frequency, CTR drop, CPL increase).

**Workflow:**
- User clicks **Run analysis** in the Creative Fatigue section.
- Backend runs **ad-level** (not campaign-level) analysis for a date range (default: last 7 days vs previous 7 days).
- Meta ad-level insights are fetched; each ad (creative) gets a fatigue **Score** and **Status**.
- Results show a summary and a table per creative.

**Metrics:**

| Metric       | How it's calculated |
|-------------|----------------------|
| **Frequency** | From Meta: `impressions ÷ reach` for the ad in the current period. |
| **CTR**       | From Meta (or computed as clicks ÷ impressions × 100). |
| **CPL**       | From Meta: `spend ÷ leads` for the ad in the current period. |
| **CTR drop %** | Compare current vs previous period: if CTR decreased, (prev − cur) ÷ prev × 100. |
| **CPL increase %** | Compare current vs previous: if CPL increased, (cur − prev) ÷ prev × 100. |
| **Score**      | Rule-based: Frequency > 3 (+30), CTR drop > 25% (+30), CPL increase > 30% (+40). Max 100. |
| **Status**     | **Healthy** (score 0–40), **Warning** (40–60), **Fatigued** (60+). |

**Backend:** `server/services/creativeFatigueService.js`, `server/routes/aiInsights.js` (POST `/api/ai/creative-fatigue`). Optional logging to `creative_fatigue_log`.

---

## 3. Lead Intelligence

**Purpose:** Lead quality scoring from form completion (and sugar level when available). No CRM or lead source integration.

**Workflow:**
- User clicks **Run scoring** in the Lead Intelligence section.
- Backend loads leads from the Leads DB for the selected date range (and optional campaign filter).
- Each lead is scored using **form completion** and optional **sugar level** (from form/field data).
- Scores are stored in `lead_scores` and a sample is returned; the UI can also load stored scores via GET.

**Scoring (0–100):**
- **Form completion:** Full (name + phone) = 10 points; partial = 5 points.
- **Sugar level** (optional): From lead data; > 200 = 20, 150–200 = 15, < 150 = 10; missing = 10 (neutral).
- Raw max = 30; score = (raw ÷ 30) × 100, clamped 0–100.

**Categories:**

| Score   | Category    |
|--------|-------------|
| 80–100 | Hot Lead    |
| 60–80  | Warm Lead   |
| 40–60  | Average     |
| 0–40   | Low Intent  |

**APIs:**
- **POST** `/api/ai/lead-quality` – run scoring (body: `dateFrom`, `dateTo`, optional `campaignIds`).
- **GET** `/api/ai/lead-quality/scores` – list stored scores (query: `dateFrom`, `dateTo`, `campaignId`, `limit`).

**Backend:** `server/services/leadQualityScoringService.js`, `server/routes/aiInsights.js`. Data in `lead_scores` (Supabase).

---

## Quick Reference

| Feature                    | Level     | Data sources              | Main output                    |
|---------------------------|-----------|---------------------------|--------------------------------|
| Lead Saturation Detection | Campaign  | Meta insights + Leads DB  | Score, Status, Frequency, CPL, Duplicate % |
| Creative Fatigue Detection| Ad (creative) | Meta ad insights    | Score, Status, Frequency, CTR, CPL        |
| Lead Intelligence         | Lead      | Leads DB (+ form/sugar)   | Score, Category (Hot/Warm/Average/Low Intent) |

All three features are implemented on the **AI Insights** page (`client/src/pages/AIInsights.jsx`) and use the AI Insights API routes in `server/routes/aiInsights.js`.
