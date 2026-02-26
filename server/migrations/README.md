# Database migrations

## Plan tables (fix "Could not find the table 'public.plan_teams' in the schema cache")

If the **Add team** modal (or Plan page) shows: **"Could not find the table 'public.plan_teams' in the schema cache"** or **"Team goals need database setup"**, run the Plan tables migration:

**Quick fix:** See **`FIX_PLAN_TEAMS_ERROR.md`** in this folder for step-by-step instructions.

## Plan tables migration steps

If the Plan page shows: **"Team goals need database setup. Run the Plan tables migration in Supabase..."**:

1. Open your **Supabase** project → **SQL Editor** → **New query**.
2. Copy the full contents of **`plan-tables.sql`** and paste into the editor.
3. Click **Run**.
4. In Supabase: **Settings** → **API** → scroll to **Schema** → click **Reload schema** (so the new tables are in the cache).
5. Refresh the Plan page in the app. The yellow message should disappear; add a team with **+ Add team** to see Team Performance & Effort & Goals.

Tables created: `plan_teams`, `plan_weekly_targets`.

---

## Instagram story snapshots (Stories tab: show existing + new data)

To show **existing** story data on the Stories tab (in addition to live stories from the last ~24h), run the story snapshots migration:

1. Open your **Supabase** project → **SQL Editor** → **New query**.
2. Copy the full contents of **`instagram-story-snapshots.sql`** and paste into the editor.
3. Click **Run**.
4. In Supabase: **Settings** → **API** → **Reload schema** (optional).

Table created: `instagram_story_snapshots`. The app will save story metrics when it fetches them (within the 24h window) and merge stored stories with live API results so the Stories tab shows both.
