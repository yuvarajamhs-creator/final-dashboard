-- Complete Supabase Schema for Marketing Dashboard
-- Run this SQL in your Supabase SQL Editor to create all tables
-- IMPORTANT: All tables use lowercase unquoted identifiers (PostgreSQL convention)

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
-- Migrate from public."Users" to public.users (lowercase)
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- Disable Row Level Security (RLS) - handled at application level with JWT
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. ADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ads (
  id SERIAL PRIMARY KEY,
  campaign TEXT NOT NULL,
  date_char CHAR(10) NOT NULL,
  leads INTEGER DEFAULT 0,
  spend NUMERIC(18,2) DEFAULT 0,
  actions_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_ads_date_char ON public.ads(date_char);
CREATE INDEX IF NOT EXISTS idx_ads_campaign ON public.ads(campaign);
CREATE INDEX IF NOT EXISTS idx_ads_date_campaign ON public.ads(date_char, campaign);

-- Disable RLS
ALTER TABLE public.ads DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 3. LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.leads (
  id SERIAL PRIMARY KEY,
  name TEXT,
  phone TEXT,
  time_utc TIMESTAMPTZ,
  date_char CHAR(10),
  campaign TEXT,
  ad_id TEXT,
  campaign_id TEXT,
  lead_id TEXT UNIQUE,
  form_id TEXT,
  page_id TEXT,
  created_time TIMESTAMPTZ,
  ad_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_leads_date_char ON public.leads(date_char);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON public.leads(campaign);
CREATE INDEX IF NOT EXISTS idx_leads_ad_campaign ON public.leads(ad_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_time ON public.leads(created_time);
CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON public.leads(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_campaign_date ON public.leads(campaign, date_char);

-- Disable RLS
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4. JOB STATE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_state (
  job_key TEXT NOT NULL PRIMARY KEY,
  job_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Disable RLS
ALTER TABLE public.job_state DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_state_updated_at
  BEFORE UPDATE ON public.job_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- VERIFICATION QUERIES (Optional - run to verify tables were created)
-- ============================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT COUNT(*) FROM public.users;
-- SELECT COUNT(*) FROM public.ads;
-- SELECT COUNT(*) FROM public.leads;
-- Note: Meta credentials are stored in .env file only, not in database

