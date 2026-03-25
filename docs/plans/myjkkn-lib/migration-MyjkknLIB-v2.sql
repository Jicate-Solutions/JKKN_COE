-- =============================================================================
-- MyjkknLIB v2.0 — Supabase Migration
-- Created : 2026-03-03
-- Updated : 2026-03-07  (v2: schema improvements, missing tables, audit, RLS fix)
-- Project : MyjkknLIB — Learning Commons Management System
-- Apply   : Supabase Dashboard -> SQL Editor  OR  supabase db push
--
-- IMPORTANT: This migration assumes the following tables already exist
--   in the target Supabase project (provided by COE project seed or
--   created fresh for MyjkknLIB standalone):
--     institutions (id UUID PK, institution_code TEXT, myjkkn_institution_ids UUID[])
--     profiles (id UUID PK, institution_id UUID)
--
-- If running as STANDALONE project, run `00_prerequisites.sql` first.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0: Extensions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- for OPAC trigram search

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 0.1: Common Helper Functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Auto-update updated_at timestamp on row modification
CREATE OR REPLACE FUNCTION lib_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: System Configuration Tables
-- ─────────────────────────────────────────────────────────────────────────────

-- Learning Commons Settings (per-institution configuration)
CREATE TABLE lib_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  setting_key           TEXT NOT NULL,
  setting_value         JSONB NOT NULL DEFAULT '{}',
  description           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, setting_key)
);

-- Knowledge Community Member Categories
-- Configures circulation privileges per category (learner, facilitator, etc.)
CREATE TABLE lib_member_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  category_code         TEXT NOT NULL,              -- 'learner', 'facilitator', 'team_member', 'guest', 'alumni'
  category_name         TEXT NOT NULL,              -- 'Learner Member', 'Learning Facilitator Member'
  max_items_allowed     INTEGER NOT NULL DEFAULT 3,
  loan_period_days      INTEGER NOT NULL DEFAULT 14,
  renewal_limit         INTEGER NOT NULL DEFAULT 2,
  renewal_period_days   INTEGER NOT NULL DEFAULT 7,
  late_charge_per_day   NUMERIC(8,2) NOT NULL DEFAULT 1.00,
  reservation_limit     INTEGER NOT NULL DEFAULT 2,
  can_access_digital    BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, category_code)
);

-- Knowledge Shelf Locations (DDC-based stacks, reference, periodicals)
CREATE TABLE lib_locations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  location_code         TEXT NOT NULL,              -- 'GEN', 'REF', 'PER', 'DIG'
  location_name         TEXT NOT NULL,              -- 'General Stack', 'Reference Section'
  floor                 TEXT,
  section               TEXT,
  is_lendable           BOOLEAN NOT NULL DEFAULT true,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, location_code)
);

-- Holiday Calendar (for accurate fine calculation excluding closed days)
CREATE TABLE lib_holidays (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  holiday_date          DATE NOT NULL,
  holiday_name          TEXT NOT NULL,
  holiday_type          TEXT NOT NULL DEFAULT 'closed' CHECK (
    holiday_type IN ('closed', 'half_day', 'no_fine')
  ),
  is_repeating          BOOLEAN NOT NULL DEFAULT false,  -- annual repeating holiday
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, holiday_date)
);

CREATE INDEX idx_lib_holidays_date ON lib_holidays(institution_id, holiday_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Knowledge Community Members
-- ─────────────────────────────────────────────────────────────────────────────

-- Knowledge Community Members
-- IMPORTANT: learner_id / facilitator_id are MyJKKN UUIDs — profile data is
-- NEVER stored here. Fetch live from MyJKKN API:
--   learner     -> GET /api-management/learners/profiles/:id
--   facilitator -> GET /api-management/staff/:id
CREATE TABLE lib_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  member_number         TEXT NOT NULL,              -- e.g. 'LIB-2024-001' (auto-generated)
  member_category       TEXT NOT NULL CHECK (member_category IN (
    'learner', 'facilitator', 'team_member', 'guest', 'alumni'
  )),
  -- MyJKKN external IDs (no local profile duplication)
  learner_id            UUID,                       -- MyJKKN learner UUID
  facilitator_id        UUID,                       -- MyJKKN staff UUID
  team_member_id        UUID,                       -- MyJKKN staff UUID (non-teaching)
  -- Local fields only for guest / alumni (not in MyJKKN)
  display_name          TEXT,
  email                 TEXT,
  phone                 TEXT,
  -- v2: Additional member fields
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  pincode               TEXT,
  date_of_birth         DATE,
  gender                TEXT CHECK (gender IN ('male', 'female', 'other')),
  id_proof_type         TEXT,                       -- 'aadhaar', 'pan', 'passport', 'voter_id'
  id_proof_number       TEXT,
  deposit_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  photo_url             TEXT,
  notes                 TEXT,
  -- Membership period
  membership_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  membership_end_date   DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_delinquent         BOOLEAN NOT NULL DEFAULT false,  -- blocks lending if true
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ,                -- soft delete
  UNIQUE(institution_id, member_number)
);

CREATE INDEX idx_lib_members_institution    ON lib_members(institution_id, is_active);
CREATE INDEX idx_lib_members_learner_id     ON lib_members(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX idx_lib_members_facilitator_id ON lib_members(facilitator_id) WHERE facilitator_id IS NOT NULL;
CREATE INDEX idx_lib_members_delinquent     ON lib_members(institution_id, is_delinquent) WHERE is_delinquent = true;
CREATE INDEX idx_lib_members_active         ON lib_members(institution_id) WHERE deleted_at IS NULL AND is_active = true;

CREATE TRIGGER trg_lib_members_updated
  BEFORE UPDATE ON lib_members
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: Knowledge Registry (Cataloguing)
-- ─────────────────────────────────────────────────────────────────────────────

-- Bibliographic catalogue records (MARC-compatible via marc_data JSONB)
CREATE TABLE lib_catalogue_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  -- Core identifiers
  title                 TEXT NOT NULL,
  subtitle              TEXT,
  resource_format       TEXT NOT NULL DEFAULT 'book' CHECK (resource_format IN (
    'book', 'periodical', 'thesis', 'report', 'map', 'audio',
    'video', 'digital', 'manuscript', 'standard', 'patent', 'other'
  )),
  isbn                  TEXT,
  issn                  TEXT,
  edition               TEXT,
  volume_number         TEXT,
  publication_year      INTEGER,
  language              TEXT NOT NULL DEFAULT 'English',
  -- Classification (DDC — standard in Indian autonomous colleges)
  classification_number TEXT,                       -- e.g. '519.5'
  call_number           TEXT,                       -- e.g. '519.5 SHA'
  subject_headings      TEXT[],
  -- Publisher
  publisher_name        TEXT,
  publisher_place       TEXT,
  series_title          TEXT,
  pages                 INTEGER,
  price                 NUMERIC(10,2),
  currency_code         TEXT NOT NULL DEFAULT 'INR',
  -- Full MARC record for import/export (ISO 2709 / MARC XML compatibility)
  marc_data             JSONB,
  -- v2: Additional catalogue fields
  abstract              TEXT,
  table_of_contents     TEXT,
  physical_description  TEXT,                       -- e.g. 'xxiv, 450 p. : ill. ; 24 cm.'
  general_note          TEXT,
  bibliographic_level   TEXT NOT NULL DEFAULT 'monograph' CHECK (
    bibliographic_level IN ('monograph', 'serial', 'collection', 'component_part', 'integrating')
  ),
  accession_source      TEXT NOT NULL DEFAULT 'purchase' CHECK (
    accession_source IN ('purchase', 'gift', 'exchange', 'donation', 'grant', 'other')
  ),
  entry_date            DATE NOT NULL DEFAULT CURRENT_DATE,  -- cataloguing date
  -- Circulation policy override (null = use member category default)
  default_loan_days     INTEGER,
  is_reference_only     BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ                -- soft delete
);

-- Full-text search index (PostgreSQL tsvector — powers OPAC search)
CREATE INDEX idx_lib_cat_title_fts ON lib_catalogue_records
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(subtitle,'') || ' ' || coalesce(abstract,'')));
CREATE INDEX idx_lib_cat_isbn        ON lib_catalogue_records(isbn)    WHERE isbn IS NOT NULL;
CREATE INDEX idx_lib_cat_issn        ON lib_catalogue_records(issn)    WHERE issn IS NOT NULL;
CREATE INDEX idx_lib_cat_class       ON lib_catalogue_records(institution_id, classification_number);
CREATE INDEX idx_lib_cat_format      ON lib_catalogue_records(institution_id, resource_format);
CREATE INDEX idx_lib_cat_year        ON lib_catalogue_records(publication_year);
CREATE INDEX idx_lib_cat_active      ON lib_catalogue_records(institution_id) WHERE deleted_at IS NULL AND is_active = true;
-- Trigram index for fuzzy search
CREATE INDEX idx_lib_cat_title_trgm  ON lib_catalogue_records USING gin(title gin_trgm_ops);

CREATE TRIGGER trg_lib_catalogue_records_updated
  BEFORE UPDATE ON lib_catalogue_records
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Authors per catalogue record (multiple authors supported)
CREATE TABLE lib_catalogue_authors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  author_name           TEXT NOT NULL,
  author_type           TEXT NOT NULL DEFAULT 'primary' CHECK (
    author_type IN ('primary', 'secondary', 'editor', 'translator', 'illustrator', 'compiler')
  ),
  sort_order            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_lib_authors_record ON lib_catalogue_authors(catalogue_record_id);
CREATE INDEX idx_lib_authors_name   ON lib_catalogue_authors USING gin(to_tsvector('english', author_name));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Resource Items (Physical Copies)
-- ─────────────────────────────────────────────────────────────────────────────

-- Accession number sequence counter (atomic increment per institution+type+year)
CREATE TABLE lib_accession_sequences (
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  resource_type_code    TEXT NOT NULL,              -- 'BK', 'PER', 'THI', 'REP', 'DIG', 'OTH'
  fiscal_year           TEXT NOT NULL,              -- '2024-25'
  last_number           BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, resource_type_code, fiscal_year)
);

-- Resource Suppliers (Vendors) — declared before lib_items for FK reference
CREATE TABLE lib_suppliers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  supplier_code         TEXT NOT NULL,
  supplier_name         TEXT NOT NULL,
  contact_person        TEXT,
  email                 TEXT,
  phone                 TEXT,
  address               TEXT,
  city                  TEXT,
  state                 TEXT,
  pincode               TEXT,
  gst_number            TEXT,
  pan_number            TEXT,
  payment_terms         TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, supplier_code)
);

CREATE TRIGGER trg_lib_suppliers_updated
  BEFORE UPDATE ON lib_suppliers
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Physical resource items — one row per physical copy
-- Accession register (statutory; accession_number is IMMUTABLE after creation)
CREATE TABLE lib_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE RESTRICT,
  location_id           UUID REFERENCES lib_locations(id) ON DELETE SET NULL,
  -- Statutory identifiers
  accession_number      TEXT NOT NULL,              -- e.g. 'JKKN/BK/2024-25/00001'
  barcode               TEXT,                       -- for barcode scanner circulation
  copy_number           INTEGER NOT NULL DEFAULT 1,
  -- Physical details
  condition             TEXT NOT NULL DEFAULT 'good' CHECK (
    condition IN ('new', 'good', 'fair', 'poor', 'damaged', 'lost')
  ),
  price                 NUMERIC(10,2),
  invoice_cost          NUMERIC(10,2),
  mrp_value             NUMERIC(10,2),
  discount              NUMERIC(10,2),
  currency_code         TEXT NOT NULL DEFAULT 'INR',
  -- v2: Additional item fields
  shelf_mark            TEXT,                       -- specific shelf location code
  replacement_price     NUMERIC(10,2),              -- cost if lost (may differ from purchase)
  internal_note         TEXT,
  last_seen_date        DATE,                       -- for stock verification
  withdrawn_date        DATE,
  withdrawn_by          UUID,
  -- Acquisition linkage
  procurement_item_id   UUID,                       -- FK to lib_procurement_items (set on receive)
  supplier_id           UUID REFERENCES lib_suppliers(id) ON DELETE SET NULL,
  date_received         DATE,
  invoice_number        TEXT,
  -- Status
  status                TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
    'available', 'on_loan', 'on_hold', 'on_order', 'in_conservation',
    'lost', 'damaged', 'retired', 'missing'
  )),
  is_lendable           BOOLEAN NOT NULL DEFAULT true,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  accession_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  deleted_at            TIMESTAMPTZ,                -- soft delete
  UNIQUE(institution_id, accession_number),
  UNIQUE(institution_id, barcode)
);

CREATE INDEX idx_lib_items_catalogue   ON lib_items(catalogue_record_id);
CREATE INDEX idx_lib_items_status      ON lib_items(institution_id, status);
CREATE INDEX idx_lib_items_location    ON lib_items(location_id);
CREATE INDEX idx_lib_items_barcode     ON lib_items(institution_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_lib_items_accession   ON lib_items(institution_id, accession_number);
CREATE INDEX idx_lib_items_date        ON lib_items(institution_id, accession_date);
CREATE INDEX idx_lib_items_active      ON lib_items(institution_id) WHERE deleted_at IS NULL AND is_active = true;

CREATE TRIGGER trg_lib_items_updated
  BEFORE UPDATE ON lib_items
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: Resource Sharing (Circulation)
-- ─────────────────────────────────────────────────────────────────────────────

-- Resource Lending Transactions (Issue / Return log)
CREATE TABLE lib_lending_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  item_id               UUID NOT NULL REFERENCES lib_items(id) ON DELETE RESTRICT,
  member_id             UUID NOT NULL REFERENCES lib_members(id) ON DELETE RESTRICT,
  -- Issue details
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date              DATE NOT NULL,
  issued_by             UUID,
  -- Return details
  returned_at           TIMESTAMPTZ,
  returned_by           UUID,
  return_condition      TEXT,
  -- Renewal tracking
  renewal_count         INTEGER NOT NULL DEFAULT 0,
  last_renewed_at       TIMESTAMPTZ,
  -- v2: Additional circulation fields
  notes                 TEXT,
  recall_date           TIMESTAMPTZ,               -- when item was recalled
  claim_returned_date   TIMESTAMPTZ,               -- patron claims returned
  -- Status
  transaction_status    TEXT NOT NULL DEFAULT 'active' CHECK (transaction_status IN (
    'active', 'returned', 'overdue', 'lost_by_member', 'recalled'
  )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_lending_member     ON lib_lending_transactions(member_id, transaction_status);
CREATE INDEX idx_lib_lending_item       ON lib_lending_transactions(item_id, transaction_status);
CREATE INDEX idx_lib_lending_active_due ON lib_lending_transactions(institution_id, due_date)
  WHERE transaction_status = 'active';
CREATE INDEX idx_lib_lending_issued     ON lib_lending_transactions(institution_id, issued_at);

CREATE TRIGGER trg_lib_lending_transactions_updated
  BEFORE UPDATE ON lib_lending_transactions
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Resource Holds (Reservations)
CREATE TABLE lib_resource_holds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES lib_members(id) ON DELETE CASCADE,
  item_id               UUID REFERENCES lib_items(id) ON DELETE SET NULL,  -- assigned when available
  hold_placed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  hold_expires_at       DATE,
  notified_at           TIMESTAMPTZ,               -- when member was notified item is available
  checked_out_at        TIMESTAMPTZ,
  hold_status           TEXT NOT NULL DEFAULT 'pending' CHECK (hold_status IN (
    'pending', 'available', 'fulfilled', 'cancelled', 'expired'
  )),
  cancellation_reason   TEXT,
  placed_by             UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_holds_member    ON lib_resource_holds(member_id, hold_status);
CREATE INDEX idx_lib_holds_catalogue ON lib_resource_holds(catalogue_record_id, hold_status);
-- Enforce: member cannot hold the same title twice simultaneously
CREATE UNIQUE INDEX idx_lib_holds_unique ON lib_resource_holds(member_id, catalogue_record_id)
  WHERE hold_status IN ('pending', 'available');

CREATE TRIGGER trg_lib_resource_holds_updated
  BEFORE UPDATE ON lib_resource_holds
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Late Return Charges (Fines)
CREATE TABLE lib_late_charges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  transaction_id        UUID NOT NULL REFERENCES lib_lending_transactions(id) ON DELETE RESTRICT,
  member_id             UUID NOT NULL REFERENCES lib_members(id) ON DELETE RESTRICT,
  -- Charge calculation
  overdue_days          INTEGER NOT NULL,
  charge_per_day        NUMERIC(8,2) NOT NULL,
  total_charge          NUMERIC(10,2) NOT NULL,
  waiver_amount         NUMERIC(10,2) NOT NULL DEFAULT 0,
  net_payable           NUMERIC(10,2) NOT NULL,
  -- Payment
  payment_status        TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN ('unpaid', 'paid', 'waived', 'partial')
  ),
  payment_date          DATE,
  payment_reference     TEXT,
  collected_by          UUID,
  waiver_reason         TEXT,
  waiver_approved_by    UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_charges_member   ON lib_late_charges(member_id, payment_status);
CREATE INDEX idx_lib_charges_unpaid   ON lib_late_charges(institution_id, payment_status)
  WHERE payment_status = 'unpaid';

CREATE TRIGGER trg_lib_late_charges_updated
  BEFORE UPDATE ON lib_late_charges
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Resource Acquisition
-- ─────────────────────────────────────────────────────────────────────────────

-- Resource Acquisition Budget Heads
CREATE TABLE lib_budget_heads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  fiscal_year           TEXT NOT NULL,              -- '2024-25'
  budget_head_code      TEXT NOT NULL,
  budget_head_name      TEXT NOT NULL,
  resource_type         TEXT CHECK (resource_type IN (
    'books', 'periodicals', 'digital', 'binding', 'equipment', 'other'
  )),
  allocated_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  committed_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,  -- on order but not paid
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, fiscal_year, budget_head_code)
);

CREATE TRIGGER trg_lib_budget_heads_updated
  BEFORE UPDATE ON lib_budget_heads
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Purchase Requests (submitted by learners / facilitators)
CREATE TABLE lib_procurement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  request_number        TEXT NOT NULL,
  requested_by          UUID,                       -- lib_members.id
  title                 TEXT NOT NULL,
  author                TEXT,
  publisher             TEXT,
  edition               TEXT,
  isbn                  TEXT,
  resource_format       TEXT NOT NULL DEFAULT 'book',
  quantity              INTEGER NOT NULL DEFAULT 1,
  estimated_price       NUMERIC(10,2),
  currency_code         TEXT NOT NULL DEFAULT 'INR',
  budget_head_id        UUID REFERENCES lib_budget_heads(id) ON DELETE SET NULL,
  purpose               TEXT,
  department            TEXT,
  priority              TEXT NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  request_status        TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN (
    'pending', 'approved', 'rejected', 'ordered', 'received', 'cancelled'
  )),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, request_number)
);

CREATE TRIGGER trg_lib_procurement_requests_updated
  BEFORE UPDATE ON lib_procurement_requests
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Procurement Orders
CREATE TABLE lib_procurement_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  order_number          TEXT NOT NULL,
  supplier_id           UUID NOT NULL REFERENCES lib_suppliers(id) ON DELETE RESTRICT,
  budget_head_id        UUID REFERENCES lib_budget_heads(id) ON DELETE SET NULL,
  fiscal_year           TEXT,
  order_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  order_type            TEXT NOT NULL DEFAULT 'firm' CHECK (
    order_type IN ('firm', 'on_approval', 'gift', 'exchange')
  ),
  total_amount          NUMERIC(14,2),
  currency_code         TEXT NOT NULL DEFAULT 'INR',
  -- v2: Additional order fields
  discount_percent      NUMERIC(5,2) NOT NULL DEFAULT 0,
  shipping_cost         NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount            NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method        TEXT,
  payment_date          DATE,
  receipt_date          DATE,
  --
  order_status          TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN (
    'draft', 'placed', 'acknowledged', 'partially_received', 'received', 'cancelled', 'claimed'
  )),
  claim_date            DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  UNIQUE(institution_id, order_number)
);

CREATE TRIGGER trg_lib_procurement_orders_updated
  BEFORE UPDATE ON lib_procurement_orders
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Procurement Order Line Items
CREATE TABLE lib_procurement_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  order_id              UUID NOT NULL REFERENCES lib_procurement_orders(id) ON DELETE CASCADE,
  request_id            UUID REFERENCES lib_procurement_requests(id) ON DELETE SET NULL,
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  isbn                  TEXT,
  quantity_ordered      INTEGER NOT NULL DEFAULT 1,
  quantity_received     INTEGER NOT NULL DEFAULT 0,
  unit_price            NUMERIC(10,2),
  discount_percent      NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_price             NUMERIC(10,2),
  total_price           NUMERIC(10,2),
  item_status           TEXT NOT NULL DEFAULT 'pending' CHECK (
    item_status IN ('pending', 'received', 'cancelled', 'claimed')
  ),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_proc_items_order ON lib_procurement_items(order_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: Periodicals Management
-- ─────────────────────────────────────────────────────────────────────────────

-- Periodical Subscriptions (journals, magazines, newspapers)
CREATE TABLE lib_periodical_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE RESTRICT,
  supplier_id           UUID REFERENCES lib_suppliers(id) ON DELETE SET NULL,
  budget_head_id        UUID REFERENCES lib_budget_heads(id) ON DELETE SET NULL,
  subscription_number   TEXT,
  subscription_type     TEXT CHECK (subscription_type IN ('print', 'online', 'both')),
  frequency             TEXT CHECK (frequency IN (
    'daily', 'weekly', 'fortnightly', 'monthly', 'bimonthly',
    'quarterly', 'half_yearly', 'annual', 'irregular'
  )),
  fiscal_year           TEXT NOT NULL,
  start_date            DATE,
  end_date              DATE,
  subscription_cost     NUMERIC(10,2),
  currency_code         TEXT NOT NULL DEFAULT 'INR',
  start_volume          TEXT,
  start_issue           TEXT,
  expected_issues       INTEGER,
  received_issues       INTEGER NOT NULL DEFAULT 0,
  access_url            TEXT,
  login_id              TEXT,
  password_hint         TEXT,
  subscription_status   TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN (
    'active', 'expired', 'cancelled', 'gratis', 'suspended'
  )),
  is_gratis             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_subs_institution ON lib_periodical_subscriptions(institution_id, subscription_status);

CREATE TRIGGER trg_lib_periodical_subscriptions_updated
  BEFORE UPDATE ON lib_periodical_subscriptions
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Individual Issues Register
CREATE TABLE lib_periodical_issues (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  subscription_id       UUID NOT NULL REFERENCES lib_periodical_subscriptions(id) ON DELETE CASCADE,
  item_id               UUID REFERENCES lib_items(id) ON DELETE SET NULL,  -- physical item
  volume_number         TEXT,
  issue_number          TEXT,
  issue_date            DATE,
  received_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  cover_date            TEXT,
  pages                 INTEGER,
  receipt_status        TEXT NOT NULL DEFAULT 'received' CHECK (receipt_status IN (
    'expected', 'received', 'missing', 'claimed', 'duplicate'
  )),
  is_bound              BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_issues_sub ON lib_periodical_issues(subscription_id, received_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: Digital Resources
-- ─────────────────────────────────────────────────────────────────────────────

-- E-books, E-journals, Databases, INFLIBNET, Institutional Repository
CREATE TABLE lib_digital_resources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  resource_title        TEXT NOT NULL,
  resource_type         TEXT NOT NULL CHECK (resource_type IN (
    'ebook', 'ejournal', 'database', 'open_access', 'inflibnet',
    'institutional_repository', 'other'
  )),
  provider              TEXT,                       -- 'INFLIBNET N-LIST', 'Springer', 'JSTOR'
  access_url            TEXT NOT NULL,
  username              TEXT,
  password_hint         TEXT,
  coverage_years        TEXT,                       -- '2010-present'
  subject_areas         TEXT[],
  subscription_start    DATE,
  subscription_end      DATE,
  annual_cost           NUMERIC(10,2),
  concurrent_users      INTEGER,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_open_access        BOOLEAN NOT NULL DEFAULT false,
  naac_reportable       BOOLEAN NOT NULL DEFAULT true,  -- counted in NAAC 4.2 metrics
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_digital_resources_updated
  BEFORE UPDATE ON lib_digital_resources
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: Footfall & Visits
-- ─────────────────────────────────────────────────────────────────────────────

-- Learner footfall — NAAC Criterion 4.2.5 (daily average visits)
CREATE TABLE lib_member_visits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id             UUID REFERENCES lib_members(id) ON DELETE SET NULL,  -- null = walk-in
  visit_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time            TIME,
  exit_time             TIME,
  visit_purpose         TEXT CHECK (visit_purpose IN (
    'reading', 'borrowing', 'returning', 'research', 'opac', 'digital', 'other'
  )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_visits_date        ON lib_member_visits(institution_id, visit_date);
CREATE INDEX idx_lib_visits_member_date ON lib_member_visits(member_id, visit_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: Resource Retirement & Conservation
-- ─────────────────────────────────────────────────────────────────────────────

-- Resource Retirement Requests (Weed-out)
CREATE TABLE lib_retirement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  item_id               UUID NOT NULL REFERENCES lib_items(id) ON DELETE RESTRICT,
  reason                TEXT NOT NULL,              -- 'obsolete', 'damaged beyond repair', 'duplicate'
  condition_at_retirement TEXT,
  recommended_by        UUID,
  approved_by           UUID,
  approval_date         DATE,
  retirement_status     TEXT NOT NULL DEFAULT 'pending' CHECK (retirement_status IN (
    'pending', 'approved', 'rejected', 'completed'
  )),
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_retirement_requests_updated
  BEFORE UPDATE ON lib_retirement_requests
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Resource Conservation Requests (Binding / Repair)
CREATE TABLE lib_conservation_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  conservation_type     TEXT NOT NULL CHECK (
    conservation_type IN ('binding', 'repair', 'lamination', 'digitisation')
  ),
  -- One of: book item OR periodical subscription (for volume binding)
  item_id               UUID REFERENCES lib_items(id) ON DELETE SET NULL,
  subscription_id       UUID REFERENCES lib_periodical_subscriptions(id) ON DELETE SET NULL,
  sent_to_binder        DATE,
  expected_return       DATE,
  actual_return         DATE,
  binder_name           TEXT,
  binder_invoice        TEXT,
  binding_cost          NUMERIC(10,2),
  conservation_status   TEXT NOT NULL DEFAULT 'identified' CHECK (conservation_status IN (
    'identified', 'sent', 'returned', 'cancelled'
  )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_conservation_requests_updated
  BEFORE UPDATE ON lib_conservation_requests
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: Inter-Campus Resource Sharing
-- ─────────────────────────────────────────────────────────────────────────────

-- Inter-Campus Resource Sharing
CREATE TABLE lib_intercampus_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id              UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,  -- requesting
  providing_institution_id    UUID REFERENCES institutions(id) ON DELETE SET NULL,            -- providing
  member_id                   UUID NOT NULL REFERENCES lib_members(id) ON DELETE RESTRICT,
  catalogue_record_id         UUID REFERENCES lib_catalogue_records(id) ON DELETE SET NULL,
  title                       TEXT NOT NULL,
  author                      TEXT,
  isbn                        TEXT,
  request_date                TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date                    DATE,
  returned_date               DATE,
  request_status              TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN (
    'pending', 'approved', 'dispatched', 'received', 'returned', 'rejected', 'lost'
  )),
  item_id                     UUID REFERENCES lib_items(id) ON DELETE SET NULL,
  request_note                TEXT,
  approved_note               TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_intercampus_requests_updated
  BEFORE UPDATE ON lib_intercampus_requests
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: v2 NEW — Notices, Audit, Stock, Course Reserves, OPAC
-- ─────────────────────────────────────────────────────────────────────────────

-- Notice Templates (overdue reminders, hold notifications, receipts)
CREATE TABLE lib_notice_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  template_code         TEXT NOT NULL,
  template_name         TEXT NOT NULL,
  subject               TEXT,
  body_text             TEXT NOT NULL,
  template_type         TEXT NOT NULL DEFAULT 'email' CHECK (
    template_type IN ('email', 'sms', 'print', 'in_app')
  ),
  trigger_event         TEXT NOT NULL CHECK (trigger_event IN (
    'overdue_reminder', 'hold_available', 'hold_expiring',
    'membership_expiring', 'item_recalled', 'fine_notice',
    'welcome', 'receipt_issue', 'receipt_return', 'custom'
  )),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, template_code)
);

CREATE TRIGGER trg_lib_notice_templates_updated
  BEFORE UPDATE ON lib_notice_templates
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Notification Queue / Sent Log
CREATE TABLE lib_notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES lib_members(id) ON DELETE CASCADE,
  template_id           UUID REFERENCES lib_notice_templates(id) ON DELETE SET NULL,
  channel               TEXT NOT NULL DEFAULT 'in_app' CHECK (
    channel IN ('email', 'sms', 'in_app')
  ),
  subject               TEXT,
  body                  TEXT NOT NULL,
  sent_at               TIMESTAMPTZ,
  read_at               TIMESTAMPTZ,
  delivery_status       TEXT NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'read')
  ),
  related_entity_type   TEXT,                       -- 'lending_transaction', 'hold', 'charge'
  related_entity_id     UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_notifications_member  ON lib_notifications(member_id, delivery_status);
CREATE INDEX idx_lib_notifications_pending ON lib_notifications(institution_id, delivery_status)
  WHERE delivery_status = 'pending';

-- Audit Log (action trail for NAAC compliance)
CREATE TABLE lib_audit_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  action                TEXT NOT NULL,              -- 'create', 'update', 'delete', 'issue', 'return'
  entity_type           TEXT NOT NULL,              -- 'member', 'item', 'lending', 'catalogue'
  entity_id             UUID,
  old_data              JSONB,
  new_data              JSONB,
  performed_by          UUID,
  performed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address            TEXT,
  user_agent            TEXT
);

CREATE INDEX idx_lib_audit_entity ON lib_audit_log(entity_type, entity_id);
CREATE INDEX idx_lib_audit_date   ON lib_audit_log(institution_id, performed_at);

-- Stock Verification (annual inventory audit)
CREATE TABLE lib_stock_verifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  verification_name     TEXT NOT NULL,
  location_id           UUID REFERENCES lib_locations(id) ON DELETE SET NULL,
  start_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date              DATE,
  total_expected        INTEGER NOT NULL DEFAULT 0,
  total_verified        INTEGER NOT NULL DEFAULT 0,
  total_missing         INTEGER NOT NULL DEFAULT 0,
  total_damaged         INTEGER NOT NULL DEFAULT 0,
  verification_status   TEXT NOT NULL DEFAULT 'in_progress' CHECK (
    verification_status IN ('planned', 'in_progress', 'completed', 'cancelled')
  ),
  conducted_by          UUID,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_stock_verifications_updated
  BEFORE UPDATE ON lib_stock_verifications
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Stock Verification Items (individual item check)
CREATE TABLE lib_stock_verification_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  verification_id       UUID NOT NULL REFERENCES lib_stock_verifications(id) ON DELETE CASCADE,
  item_id               UUID NOT NULL REFERENCES lib_items(id) ON DELETE RESTRICT,
  found_status          TEXT NOT NULL DEFAULT 'not_checked' CHECK (
    found_status IN ('not_checked', 'found', 'missing', 'damaged', 'misplaced')
  ),
  scanned_at            TIMESTAMPTZ,
  scanned_by            UUID,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_sv_items_verification ON lib_stock_verification_items(verification_id);
CREATE INDEX idx_lib_sv_items_item         ON lib_stock_verification_items(item_id);

-- Course Reserves (academic reading lists linked to courses)
CREATE TABLE lib_course_reserves (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_name           TEXT NOT NULL,
  course_code           TEXT,
  department            TEXT,
  instructor_name       TEXT,
  instructor_id         UUID,                       -- MyJKKN staff UUID
  academic_year         TEXT,
  semester              TEXT,
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  item_id               UUID REFERENCES lib_items(id) ON DELETE SET NULL,
  reserve_note          TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID
);

CREATE INDEX idx_lib_course_reserves_course    ON lib_course_reserves(institution_id, course_code);
CREATE INDEX idx_lib_course_reserves_catalogue ON lib_course_reserves(catalogue_record_id);

CREATE TRIGGER trg_lib_course_reserves_updated
  BEFORE UPDATE ON lib_course_reserves
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Reading Lists (member-curated book lists)
CREATE TABLE lib_reading_lists (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id             UUID NOT NULL REFERENCES lib_members(id) ON DELETE CASCADE,
  list_name             TEXT NOT NULL,
  description           TEXT,
  is_public             BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_lib_reading_lists_updated
  BEFORE UPDATE ON lib_reading_lists
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- Reading List Items
CREATE TABLE lib_reading_list_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id               UUID NOT NULL REFERENCES lib_reading_lists(id) ON DELETE CASCADE,
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  notes                 TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  added_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, catalogue_record_id)
);

-- Member Book Suggestions
CREATE TABLE lib_suggestions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id             UUID REFERENCES lib_members(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  author                TEXT,
  publisher             TEXT,
  isbn                  TEXT,
  publication_year      INTEGER,
  resource_format       TEXT DEFAULT 'book',
  reason                TEXT,
  suggestion_status     TEXT NOT NULL DEFAULT 'pending' CHECK (
    suggestion_status IN ('pending', 'accepted', 'rejected', 'ordered')
  ),
  manager_note          TEXT,
  managed_by            UUID,
  managed_at            TIMESTAMPTZ,
  procurement_request_id UUID REFERENCES lib_procurement_requests(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_suggestions_institution ON lib_suggestions(institution_id, suggestion_status);

CREATE TRIGGER trg_lib_suggestions_updated
  BEFORE UPDATE ON lib_suggestions
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- OPAC Search Log (discovery analytics)
CREATE TABLE lib_opac_search_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id             UUID REFERENCES lib_members(id) ON DELETE SET NULL,
  search_query          TEXT NOT NULL,
  search_type           TEXT DEFAULT 'keyword',     -- 'keyword', 'title', 'author', 'isbn', 'subject'
  result_count          INTEGER NOT NULL DEFAULT 0,
  filters_applied       JSONB,
  searched_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lib_opac_search_date ON lib_opac_search_log(institution_id, searched_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all lib_ tables
ALTER TABLE lib_settings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_member_categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_locations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_holidays                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_members                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_catalogue_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_catalogue_authors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_accession_sequences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_suppliers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_items                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_lending_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_resource_holds            ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_late_charges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_budget_heads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_periodical_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_periodical_issues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_digital_resources         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_member_visits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_retirement_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_conservation_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_intercampus_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_notice_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_notifications             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_audit_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_stock_verifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_stock_verification_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_course_reserves           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_reading_lists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_reading_list_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_suggestions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_opac_search_log           ENABLE ROW LEVEL SECURITY;

-- ── Institution-scoped RLS policies ──────────────────────────────────────────
-- NOTE: Per Supabase best practices:
--   1. Separate policies per operation (SELECT, INSERT, UPDATE, DELETE)
--   2. Wrap auth.uid() in (SELECT ...) for performance
--   3. Specify TO authenticated

-- ── lib_catalogue_records ────────────────────────────────────────────────────

CREATE POLICY "lib_catalogue_select" ON lib_catalogue_records
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_catalogue_insert" ON lib_catalogue_records
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_catalogue_update" ON lib_catalogue_records
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_catalogue_delete" ON lib_catalogue_records
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── lib_items ────────────────────────────────────────────────────────────────

CREATE POLICY "lib_items_select" ON lib_items
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_items_insert" ON lib_items
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_items_update" ON lib_items
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_items_delete" ON lib_items
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── lib_members (staff see all institution; learner sees own) ────────────────

CREATE POLICY "lib_members_select" ON lib_members
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
    OR learner_id = (SELECT auth.uid())
    OR facilitator_id = (SELECT auth.uid())
  );

CREATE POLICY "lib_members_insert" ON lib_members
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_members_update" ON lib_members
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_members_delete" ON lib_members
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── lib_lending_transactions (staff see institution; member sees own) ────────

CREATE POLICY "lib_lending_select" ON lib_lending_transactions
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
    OR member_id IN (
      SELECT id FROM lib_members WHERE learner_id = (SELECT auth.uid()) OR facilitator_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lib_lending_insert" ON lib_lending_transactions
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_lending_update" ON lib_lending_transactions
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_lending_delete" ON lib_lending_transactions
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── lib_late_charges (staff see institution; member sees own) ────────────────

CREATE POLICY "lib_charges_select" ON lib_late_charges
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
    OR member_id IN (
      SELECT id FROM lib_members WHERE learner_id = (SELECT auth.uid()) OR facilitator_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lib_charges_insert" ON lib_late_charges
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_charges_update" ON lib_late_charges
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_charges_delete" ON lib_late_charges
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── lib_resource_holds (staff + member's own) ────────────────────────────────

CREATE POLICY "lib_holds_select" ON lib_resource_holds
  FOR SELECT TO authenticated
  USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
    OR member_id IN (
      SELECT id FROM lib_members WHERE learner_id = (SELECT auth.uid()) OR facilitator_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "lib_holds_insert" ON lib_resource_holds
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_holds_update" ON lib_resource_holds
  FOR UPDATE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

CREATE POLICY "lib_holds_delete" ON lib_resource_holds
  FOR DELETE TO authenticated
  USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ── Institution-scoped policies for remaining tables ─────────────────────────
-- (These tables: staff-only access, institution-scoped)

-- Macro to create 4 policies per table (SELECT, INSERT, UPDATE, DELETE)
-- Applied to: lib_settings, lib_member_categories, lib_locations, lib_holidays,
--             lib_catalogue_authors, lib_accession_sequences, lib_suppliers,
--             lib_budget_heads, lib_procurement_requests, lib_procurement_orders,
--             lib_procurement_items, lib_periodical_subscriptions, lib_periodical_issues,
--             lib_digital_resources, lib_member_visits, lib_retirement_requests,
--             lib_conservation_requests, lib_intercampus_requests, lib_notice_templates,
--             lib_notifications, lib_audit_log, lib_stock_verifications,
--             lib_stock_verification_items, lib_course_reserves, lib_reading_lists,
--             lib_reading_list_items, lib_suggestions, lib_opac_search_log

-- lib_settings
CREATE POLICY "lib_settings_select" ON lib_settings FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_settings_insert" ON lib_settings FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_settings_update" ON lib_settings FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_settings_delete" ON lib_settings FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_member_categories
CREATE POLICY "lib_member_cat_select" ON lib_member_categories FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_member_cat_insert" ON lib_member_categories FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_member_cat_update" ON lib_member_categories FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_member_cat_delete" ON lib_member_categories FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_locations
CREATE POLICY "lib_locations_select" ON lib_locations FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_locations_insert" ON lib_locations FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_locations_update" ON lib_locations FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_locations_delete" ON lib_locations FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_holidays
CREATE POLICY "lib_holidays_select" ON lib_holidays FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_holidays_insert" ON lib_holidays FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_holidays_update" ON lib_holidays FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_holidays_delete" ON lib_holidays FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_catalogue_authors
CREATE POLICY "lib_cat_authors_select" ON lib_catalogue_authors FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cat_authors_insert" ON lib_catalogue_authors FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cat_authors_update" ON lib_catalogue_authors FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cat_authors_delete" ON lib_catalogue_authors FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_accession_sequences
CREATE POLICY "lib_accession_seq_select" ON lib_accession_sequences FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_accession_seq_insert" ON lib_accession_sequences FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_accession_seq_update" ON lib_accession_sequences FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_accession_seq_delete" ON lib_accession_sequences FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_suppliers
CREATE POLICY "lib_suppliers_select" ON lib_suppliers FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suppliers_insert" ON lib_suppliers FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suppliers_update" ON lib_suppliers FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suppliers_delete" ON lib_suppliers FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_budget_heads
CREATE POLICY "lib_budget_select" ON lib_budget_heads FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_budget_insert" ON lib_budget_heads FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_budget_update" ON lib_budget_heads FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_budget_delete" ON lib_budget_heads FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_procurement_requests
CREATE POLICY "lib_proc_req_select" ON lib_procurement_requests FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_req_insert" ON lib_procurement_requests FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_req_update" ON lib_procurement_requests FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_req_delete" ON lib_procurement_requests FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_procurement_orders
CREATE POLICY "lib_proc_orders_select" ON lib_procurement_orders FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_orders_insert" ON lib_procurement_orders FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_orders_update" ON lib_procurement_orders FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_orders_delete" ON lib_procurement_orders FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_procurement_items
CREATE POLICY "lib_proc_items_select" ON lib_procurement_items FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_items_insert" ON lib_procurement_items FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_items_update" ON lib_procurement_items FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_proc_items_delete" ON lib_procurement_items FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_periodical_subscriptions
CREATE POLICY "lib_subs_select" ON lib_periodical_subscriptions FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_subs_insert" ON lib_periodical_subscriptions FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_subs_update" ON lib_periodical_subscriptions FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_subs_delete" ON lib_periodical_subscriptions FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_periodical_issues
CREATE POLICY "lib_issues_select" ON lib_periodical_issues FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_issues_insert" ON lib_periodical_issues FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_issues_update" ON lib_periodical_issues FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_issues_delete" ON lib_periodical_issues FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_digital_resources
CREATE POLICY "lib_digital_select" ON lib_digital_resources FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_digital_insert" ON lib_digital_resources FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_digital_update" ON lib_digital_resources FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_digital_delete" ON lib_digital_resources FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_member_visits
CREATE POLICY "lib_visits_select" ON lib_member_visits FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_visits_insert" ON lib_member_visits FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_visits_update" ON lib_member_visits FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_visits_delete" ON lib_member_visits FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_retirement_requests
CREATE POLICY "lib_retirement_select" ON lib_retirement_requests FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_retirement_insert" ON lib_retirement_requests FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_retirement_update" ON lib_retirement_requests FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_retirement_delete" ON lib_retirement_requests FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_conservation_requests
CREATE POLICY "lib_conservation_select" ON lib_conservation_requests FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_conservation_insert" ON lib_conservation_requests FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_conservation_update" ON lib_conservation_requests FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_conservation_delete" ON lib_conservation_requests FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_intercampus_requests
CREATE POLICY "lib_intercampus_select" ON lib_intercampus_requests FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_intercampus_insert" ON lib_intercampus_requests FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_intercampus_update" ON lib_intercampus_requests FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_intercampus_delete" ON lib_intercampus_requests FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_notice_templates
CREATE POLICY "lib_notice_tpl_select" ON lib_notice_templates FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_notice_tpl_insert" ON lib_notice_templates FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_notice_tpl_update" ON lib_notice_templates FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_notice_tpl_delete" ON lib_notice_templates FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_notifications (member can see own)
CREATE POLICY "lib_notif_select" ON lib_notifications FOR SELECT TO authenticated USING (
  institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
  OR member_id IN (SELECT id FROM lib_members WHERE learner_id = (SELECT auth.uid()) OR facilitator_id = (SELECT auth.uid()))
);
CREATE POLICY "lib_notif_insert" ON lib_notifications FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_notif_update" ON lib_notifications FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_notif_delete" ON lib_notifications FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_audit_log
CREATE POLICY "lib_audit_select" ON lib_audit_log FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_audit_insert" ON lib_audit_log FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_stock_verifications
CREATE POLICY "lib_sv_select" ON lib_stock_verifications FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_sv_insert" ON lib_stock_verifications FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_sv_update" ON lib_stock_verifications FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_sv_delete" ON lib_stock_verifications FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_stock_verification_items
CREATE POLICY "lib_svi_select" ON lib_stock_verification_items FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_svi_insert" ON lib_stock_verification_items FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_svi_update" ON lib_stock_verification_items FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_svi_delete" ON lib_stock_verification_items FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_course_reserves
CREATE POLICY "lib_cr_select" ON lib_course_reserves FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cr_insert" ON lib_course_reserves FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cr_update" ON lib_course_reserves FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_cr_delete" ON lib_course_reserves FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_reading_lists (member can see own + public lists)
CREATE POLICY "lib_rl_select" ON lib_reading_lists FOR SELECT TO authenticated USING (
  institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))
);
CREATE POLICY "lib_rl_insert" ON lib_reading_lists FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_rl_update" ON lib_reading_lists FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_rl_delete" ON lib_reading_lists FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_reading_list_items (inherits access from parent list via join)
CREATE POLICY "lib_rli_select" ON lib_reading_list_items FOR SELECT TO authenticated USING (
  list_id IN (SELECT id FROM lib_reading_lists WHERE institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
);
CREATE POLICY "lib_rli_insert" ON lib_reading_list_items FOR INSERT TO authenticated WITH CHECK (
  list_id IN (SELECT id FROM lib_reading_lists WHERE institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
);
CREATE POLICY "lib_rli_update" ON lib_reading_list_items FOR UPDATE TO authenticated USING (
  list_id IN (SELECT id FROM lib_reading_lists WHERE institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
) WITH CHECK (
  list_id IN (SELECT id FROM lib_reading_lists WHERE institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
);
CREATE POLICY "lib_rli_delete" ON lib_reading_list_items FOR DELETE TO authenticated USING (
  list_id IN (SELECT id FROM lib_reading_lists WHERE institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())))
);

-- lib_suggestions
CREATE POLICY "lib_suggest_select" ON lib_suggestions FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suggest_insert" ON lib_suggestions FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suggest_update" ON lib_suggestions FOR UPDATE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid()))) WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_suggest_delete" ON lib_suggestions FOR DELETE TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- lib_opac_search_log
CREATE POLICY "lib_opac_log_select" ON lib_opac_search_log FOR SELECT TO authenticated USING (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
CREATE POLICY "lib_opac_log_insert" ON lib_opac_search_log FOR INSERT TO authenticated WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: Helper Functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Atomic accession number generation
-- Usage: SELECT lib_next_accession('inst-uuid', 'BK', '2024-25');
-- Returns: 'INST_CODE/BK/2024-25/00001'
CREATE OR REPLACE FUNCTION lib_next_accession(
  p_institution_id  UUID,
  p_resource_type   TEXT,  -- 'BK', 'PER', 'THI', 'REP', 'DIG', 'OTH'
  p_fiscal_year     TEXT   -- '2024-25'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq       BIGINT;
  v_inst_code TEXT;
BEGIN
  -- Get institution code
  SELECT institution_code INTO v_inst_code
  FROM institutions WHERE id = p_institution_id;

  -- Insert or increment sequence atomically
  INSERT INTO lib_accession_sequences (institution_id, resource_type_code, fiscal_year, last_number)
    VALUES (p_institution_id, p_resource_type, p_fiscal_year, 1)
  ON CONFLICT (institution_id, resource_type_code, fiscal_year)
  DO UPDATE SET last_number = lib_accession_sequences.last_number + 1
  RETURNING last_number INTO v_seq;

  -- Format: INST/TYPE/FY/00001
  RETURN upper(v_inst_code) || '/' || p_resource_type || '/' || p_fiscal_year || '/' || lpad(v_seq::TEXT, 5, '0');
END;
$$;

-- Compute overdue days excluding holidays
CREATE OR REPLACE FUNCTION lib_overdue_days(
  p_institution_id UUID,
  p_due_date DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0,
    (CURRENT_DATE - p_due_date) -
    COALESCE((
      SELECT COUNT(*)::INTEGER FROM lib_holidays
      WHERE institution_id = p_institution_id
      AND holiday_date BETWEEN p_due_date AND CURRENT_DATE
      AND holiday_type = 'closed'
    ), 0)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15: Seed Data
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTE: Replace 'YOUR_INSTITUTION_ID' with actual institution UUID before running.
-- Seed: Default member categories
-- Run after inserting your institution record.

/*
INSERT INTO lib_member_categories
  (institution_id, category_code, category_name, max_items_allowed, loan_period_days, renewal_limit, renewal_period_days, late_charge_per_day)
VALUES
  ('YOUR_INSTITUTION_ID', 'learner',     'Learner Member',                    3,  14, 2, 7,  1.00),
  ('YOUR_INSTITUTION_ID', 'facilitator', 'Learning Facilitator Member',       10, 30, 3, 14, 0.00),
  ('YOUR_INSTITUTION_ID', 'team_member', 'Knowledge Commons Associate Member', 5,  21, 2, 7,  1.00),
  ('YOUR_INSTITUTION_ID', 'guest',       'Guest Member',                       1,  7,  0, 0,  2.00),
  ('YOUR_INSTITUTION_ID', 'alumni',      'Alumni Member',                      2,  14, 1, 7,  1.00);

INSERT INTO lib_locations
  (institution_id, location_code, location_name, is_lendable, sort_order)
VALUES
  ('YOUR_INSTITUTION_ID', 'GEN',  'General Stack',        true,  1),
  ('YOUR_INSTITUTION_ID', 'REF',  'Reference Section',    false, 2),
  ('YOUR_INSTITUTION_ID', 'PER',  'Periodicals Section',  false, 3),
  ('YOUR_INSTITUTION_ID', 'DIG',  'Digital Resources',    false, 4),
  ('YOUR_INSTITUTION_ID', 'THI',  'Thesis Collection',    false, 5),
  ('YOUR_INSTITUTION_ID', 'RES',  'Reserved Collection',  true,  6);

INSERT INTO lib_settings (institution_id, setting_key, setting_value, description)
VALUES
  ('YOUR_INSTITUTION_ID', 'library_name', '"JKKN Learning Commons"', 'Display name for the library'),
  ('YOUR_INSTITUTION_ID', 'working_hours', '{"open": "09:00", "close": "17:00"}', 'Library working hours'),
  ('YOUR_INSTITUTION_ID', 'fine_grace_days', '0', 'Grace days before fine starts'),
  ('YOUR_INSTITUTION_ID', 'auto_delinquent_threshold', '50.00', 'Amount at which member becomes delinquent'),
  ('YOUR_INSTITUTION_ID', 'barcode_prefix', '"JKKN"', 'Prefix for auto-generated barcodes');

INSERT INTO lib_notice_templates (institution_id, template_code, template_name, subject, body_text, template_type, trigger_event)
VALUES
  ('YOUR_INSTITUTION_ID', 'OVERDUE_1', 'First Overdue Notice', 'Overdue: {{title}}',
   'Dear {{member_name}}, the resource "{{title}}" (Accession: {{accession_number}}) was due on {{due_date}}. Please return it at your earliest convenience. Late charges of Rs. {{charge_per_day}}/day apply.',
   'email', 'overdue_reminder'),
  ('YOUR_INSTITUTION_ID', 'HOLD_READY', 'Hold Available Notice', 'Your hold is ready: {{title}}',
   'Dear {{member_name}}, the resource "{{title}}" you placed on hold is now available for pickup. Please collect it within 3 days.',
   'email', 'hold_available'),
  ('YOUR_INSTITUTION_ID', 'WELCOME', 'Welcome to Learning Commons', 'Welcome to JKKN Learning Commons',
   'Dear {{member_name}}, welcome to the JKKN Learning Commons! Your member number is {{member_number}}. You can borrow up to {{max_items}} resources.',
   'email', 'welcome');
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION v2.0
-- =============================================================================
-- SCHEMA SUMMARY:
--   Tables:    35 (22 original + 13 new)
--   Indexes:   35+
--   Functions: 3  (lib_update_timestamp, lib_next_accession, lib_overdue_days)
--   Triggers:  15 (auto-update timestamps)
--   RLS:       140 policies (4 per table x 35 tables, minus audit_log/search_log)
--   Extensions: 2 (uuid-ossp, pg_trgm)
-- =============================================================================
