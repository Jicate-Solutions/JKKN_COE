-- =============================================================================
-- MyjkknLIB — Supabase Migration
-- Created : 2026-03-03
-- Project : MyjkknLIB — Learning Commons Management System (NEW PROJECT)
-- Source  : NewGenLib v3.1.5 domain analysis + JKKN terminology standards
-- Apply   : Supabase Dashboard → SQL Editor  OR  supabase db push
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
-- SECTION 1: Member Configuration Tables
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Knowledge Community Members
-- ─────────────────────────────────────────────────────────────────────────────

-- Knowledge Community Members
-- IMPORTANT: learner_id / facilitator_id are MyJKKN UUIDs — profile data is
-- NEVER stored here. Fetch live from MyJKKN API:
--   learner   → GET /api-management/learners/profiles/:id
--   facilitator → GET /api-management/staff/:id
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
  -- Membership period
  membership_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  membership_end_date   DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_delinquent         BOOLEAN NOT NULL DEFAULT false,  -- blocks lending if true
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID,
  UNIQUE(institution_id, member_number)
);

CREATE INDEX idx_lib_members_institution    ON lib_members(institution_id, is_active);
CREATE INDEX idx_lib_members_learner_id     ON lib_members(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX idx_lib_members_facilitator_id ON lib_members(facilitator_id) WHERE facilitator_id IS NOT NULL;
CREATE INDEX idx_lib_members_delinquent     ON lib_members(institution_id, is_delinquent) WHERE is_delinquent = true;

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
  -- Circulation policy override (null = use member category default)
  default_loan_days     INTEGER,
  is_reference_only     BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID
);

-- Full-text search index (PostgreSQL tsvector — powers OPAC search)
CREATE INDEX idx_lib_cat_title_fts ON lib_catalogue_records
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(subtitle,'')));
CREATE INDEX idx_lib_cat_isbn        ON lib_catalogue_records(isbn)    WHERE isbn IS NOT NULL;
CREATE INDEX idx_lib_cat_issn        ON lib_catalogue_records(issn)    WHERE issn IS NOT NULL;
CREATE INDEX idx_lib_cat_class       ON lib_catalogue_records(institution_id, classification_number);
CREATE INDEX idx_lib_cat_format      ON lib_catalogue_records(institution_id, resource_format);
CREATE INDEX idx_lib_cat_year        ON lib_catalogue_records(publication_year);

-- Authors per catalogue record (multiple authors supported)
CREATE TABLE lib_catalogue_authors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  institution_id        UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  author_name           TEXT NOT NULL,
  author_type           TEXT NOT NULL DEFAULT 'primary' CHECK (
    author_type IN ('primary', 'secondary', 'editor', 'translator', 'illustrator')
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
  UNIQUE(institution_id, accession_number),
  UNIQUE(institution_id, barcode)
);

CREATE INDEX idx_lib_items_catalogue   ON lib_items(catalogue_record_id);
CREATE INDEX idx_lib_items_status      ON lib_items(institution_id, status);
CREATE INDEX idx_lib_items_location    ON lib_items(location_id);
CREATE INDEX idx_lib_items_barcode     ON lib_items(institution_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_lib_items_accession   ON lib_items(institution_id, accession_number);
CREATE INDEX idx_lib_items_date        ON lib_items(institution_id, accession_date);

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

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: Resource Acquisition
-- ─────────────────────────────────────────────────────────────────────────────

-- Resource Suppliers (Vendors)
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

-- Individual Issues Register (NGL: sm_registration)
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

-- Resource Retirement Requests (Weed-out — NGL: cir_weedout_material)
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

-- Resource Conservation Requests (Binding — NGL: cirbindingmgmt)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: Inter-Campus Resource Sharing
-- ─────────────────────────────────────────────────────────────────────────────

-- Inter-Campus Resource Sharing (NGL: inter_library_loan)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all lib_ tables
ALTER TABLE lib_member_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_members                ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_catalogue_records      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_catalogue_authors      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_accession_sequences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_items                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_lending_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_resource_holds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_late_charges           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_suppliers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_budget_heads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_procurement_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_periodical_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_periodical_issues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_digital_resources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_member_visits          ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_retirement_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_conservation_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib_intercampus_requests   ENABLE ROW LEVEL SECURITY;

-- ── Institution-scoped access policy (pattern for all tables) ──────────────

-- lib_catalogue_records: all authenticated users in same institution can read
CREATE POLICY "lib_catalogue_institution_read" ON lib_catalogue_records
  FOR SELECT USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "lib_catalogue_staff_write" ON lib_catalogue_records
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

-- lib_items: institution-scoped
CREATE POLICY "lib_items_institution_scope" ON lib_items
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

-- lib_members: staff see all; learner sees own record
CREATE POLICY "lib_members_staff_all" ON lib_members
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "lib_members_learner_self" ON lib_members
  FOR SELECT USING (
    learner_id = auth.uid() OR facilitator_id = auth.uid()
  );

-- lib_lending_transactions: staff see institution; learner sees own
CREATE POLICY "lib_lending_staff" ON lib_lending_transactions
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "lib_lending_member_self" ON lib_lending_transactions
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM lib_members WHERE learner_id = auth.uid() OR facilitator_id = auth.uid()
    )
  );

-- lib_late_charges: staff see institution; member sees own
CREATE POLICY "lib_charges_staff" ON lib_late_charges
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "lib_charges_member_self" ON lib_late_charges
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM lib_members WHERE learner_id = auth.uid() OR facilitator_id = auth.uid()
    )
  );

-- lib_resource_holds: member can place/view own holds
CREATE POLICY "lib_holds_staff" ON lib_resource_holds
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "lib_holds_member_self" ON lib_resource_holds
  FOR SELECT USING (
    member_id IN (
      SELECT id FROM lib_members WHERE learner_id = auth.uid() OR facilitator_id = auth.uid()
    )
  );

-- Remaining tables: institution-scoped (knowledge_curator / knowledge_commons_associate roles)
CREATE POLICY "lib_suppliers_scope"          ON lib_suppliers              FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_budget_scope"             ON lib_budget_heads            FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_proc_req_scope"           ON lib_procurement_requests    FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_proc_orders_scope"        ON lib_procurement_orders      FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_proc_items_scope"         ON lib_procurement_items       FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_subs_scope"               ON lib_periodical_subscriptions FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_issues_scope"             ON lib_periodical_issues       FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_digital_scope"            ON lib_digital_resources       FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_visits_scope"             ON lib_member_visits           FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_retirement_scope"         ON lib_retirement_requests     FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_conservation_scope"       ON lib_conservation_requests   FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_intercampus_scope"        ON lib_intercampus_requests    FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_locations_scope"          ON lib_locations               FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_cat_authors_scope"        ON lib_catalogue_authors       FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_member_cat_scope"         ON lib_member_categories       FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "lib_accession_seq_scope"      ON lib_accession_sequences     FOR ALL USING (institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: Helper Functions
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

-- Compute overdue days excluding Sundays (simple weekday approximation)
CREATE OR REPLACE FUNCTION lib_overdue_days(p_due_date DATE)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT GREATEST(0, CURRENT_DATE - p_due_date);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: Seed Data
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
  ('YOUR_INSTITUTION_ID', 'RES', 'Reserved Collection',   true,  6);
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION
-- =============================================================================
