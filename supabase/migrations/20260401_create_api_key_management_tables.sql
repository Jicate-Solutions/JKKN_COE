-- =====================================================
-- API KEY MANAGEMENT TABLES
-- Date: 2026-04-01
-- Purpose: Create tables for external API key management
--   - api_applications: Registered external applications
--   - api_keys: Credentials per application
--   - api_permissions: Module + operation + institution per app
--   - api_audit_logs: Full request/response logging
--   - api_key_events: Key lifecycle tracking
-- =====================================================

-- =========================
-- 1. api_applications
-- =========================
CREATE TABLE IF NOT EXISTS public.api_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner text,
  allowed_domains text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  institutions_id uuid,
  institution_code text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_applications_pkey PRIMARY KEY (id),
  CONSTRAINT api_applications_status_check CHECK (status IN ('active', 'suspended')),
  CONSTRAINT api_applications_institutions_id_fkey FOREIGN KEY (institutions_id) REFERENCES institutions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_applications_institutions_id ON public.api_applications USING btree (institutions_id);
CREATE INDEX IF NOT EXISTS idx_api_applications_status ON public.api_applications USING btree (status);
CREATE INDEX IF NOT EXISTS idx_api_applications_institution_code ON public.api_applications USING btree (institution_code);

-- =========================
-- 2. api_keys
-- =========================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  access_key_id text NOT NULL,
  secret_key_hash text NOT NULL,
  key_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_keys_pkey PRIMARY KEY (id),
  CONSTRAINT api_keys_access_key_id_key UNIQUE (access_key_id),
  CONSTRAINT api_keys_status_check CHECK (status IN ('active', 'revoked', 'expired')),
  CONSTRAINT api_keys_app_id_fkey FOREIGN KEY (app_id) REFERENCES api_applications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_app_id ON public.api_keys USING btree (app_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_access_key_id ON public.api_keys USING btree (access_key_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_status ON public.api_keys USING btree (status);

-- =========================
-- 3. api_permissions
-- =========================
CREATE TABLE IF NOT EXISTS public.api_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_id uuid NOT NULL,
  module text NOT NULL,
  operation text NOT NULL,
  institution_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT api_permissions_unique UNIQUE (app_id, module, operation, institution_id),
  CONSTRAINT api_permissions_operation_check CHECK (operation IN ('read', 'create', 'update', 'delete')),
  CONSTRAINT api_permissions_app_id_fkey FOREIGN KEY (app_id) REFERENCES api_applications(id) ON DELETE CASCADE,
  CONSTRAINT api_permissions_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_permissions_app_id ON public.api_permissions USING btree (app_id);
CREATE INDEX IF NOT EXISTS idx_api_permissions_module ON public.api_permissions USING btree (module);
CREATE INDEX IF NOT EXISTS idx_api_permissions_institution_id ON public.api_permissions USING btree (institution_id);

-- =========================
-- 4. api_audit_logs
-- =========================
CREATE TABLE IF NOT EXISTS public.api_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  app_id uuid,
  access_key_id text,
  method text NOT NULL,
  endpoint text NOT NULL,
  query_params jsonb,
  request_body jsonb,
  response_status integer,
  response_time_ms integer,
  ip_address text,
  origin text,
  user_agent text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT api_audit_logs_app_id_fkey FOREIGN KEY (app_id) REFERENCES api_applications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_api_audit_logs_app_id_created_at ON public.api_audit_logs USING btree (app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_access_key_id ON public.api_audit_logs USING btree (access_key_id);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_created_at ON public.api_audit_logs USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_audit_logs_endpoint ON public.api_audit_logs USING btree (endpoint);

-- =========================
-- 5. api_key_events
-- =========================
CREATE TABLE IF NOT EXISTS public.api_key_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL,
  event_type text NOT NULL,
  performed_by uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_key_events_pkey PRIMARY KEY (id),
  CONSTRAINT api_key_events_event_type_check CHECK (event_type IN ('created', 'revoked', 'regenerated', 'expired')),
  CONSTRAINT api_key_events_key_id_fkey FOREIGN KEY (key_id) REFERENCES api_keys(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_key_events_key_id ON public.api_key_events USING btree (key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_events_event_type ON public.api_key_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_api_key_events_created_at ON public.api_key_events USING btree (created_at DESC);

-- =========================
-- RLS Policies
-- =========================
ALTER TABLE public.api_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_events ENABLE ROW LEVEL SECURITY;

-- Service role policies (bypass RLS for server-side API routes)
CREATE POLICY "service_role_api_applications" ON public.api_applications
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_api_keys" ON public.api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_api_permissions" ON public.api_permissions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_api_audit_logs" ON public.api_audit_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_api_key_events" ON public.api_key_events
  FOR ALL USING (auth.role() = 'service_role');

-- =========================
-- updated_at trigger for api_applications
-- =========================
CREATE OR REPLACE FUNCTION public.update_api_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_api_applications_updated_at') THEN
    CREATE TRIGGER tr_api_applications_updated_at
      BEFORE UPDATE ON public.api_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.update_api_applications_updated_at();
  END IF;
END $$;
