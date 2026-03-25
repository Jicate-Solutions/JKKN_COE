# MyjkknLIB — Library Management System Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full-featured, NAAC/NBA-ready Library Management System for JKKN autonomous colleges, modernising NewGenLib v3.1.5 into a Next.js 15 + Supabase web application with JKKN terminology, MyJKKN learner/facilitator integration, and accreditation-grade reporting.

**Architecture:** 5-layer pattern (Types → Services → Hooks → Components → Pages). Multi-tenant via `institution_id` RLS (replaces NGL's composite `library_id` pattern). All physical item copies tracked as `lib_items` linked to `lib_catalogue_records`. Circulation, acquisition, serials, and OPAC are independent modules sharing the catalogue core.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Shadcn UI, Tailwind CSS, MyJKKN API integration

**Source Reference:** NewGenLib (NGL) v3.1.5 — open-source ILS used as domain model baseline. `InstallNGL3.2/scripts/AddedScripts.sql` and Hibernate bean analysis informed this spec.

---

## Indian Regulatory Framework

### Applicable Bodies

| Body | Full Name | Role in Library |
|---|---|---|
| **NAAC** | National Assessment and Accreditation Council | Criterion 4.2: Library as a Learning Resource — books, journals, e-resources, usage stats |
| **NBA** | National Board of Accreditation | SSR Criterion 4: Infrastructure — technical library collection adequacy |
| **UGC** | University Grants Commission | Guidelines on library resource standards per student strength |
| **AICTE** | All India Council for Technical Education | Mandates minimum volumes per program for technical colleges |
| **IQAC** | Internal Quality Assurance Cell | Coordinates annual library audit, usage data for NAAC |

### NAAC Criterion 4.2 — Library as a Learning Resource

| Metric | What System Must Track |
|---|---|
| 4.2.1 | Library automation (ILS used, modules active) |
| 4.2.2 | Subscription to e-resources (INFLIBNET, e-journals, databases) |
| 4.2.3 | Annual expenditure on library resources (books, journals, e-resources) |
| 4.2.4 | Number of books added per year |
| 4.2.5 | Learner footfall and library usage per day |
| 4.2.6 | E-content/digital resources available |

### Indian Library Standards

| Standard | Description | System Implementation |
|---|---|---|
| **DDC** | Dewey Decimal Classification (most common in India) | `classification_number` on catalogue records |
| **MARC 21** | Machine-Readable Cataloguing — field-level metadata | `marc_data` JSONB column on catalogue records |
| **ISBN / ISSN** | International Standard Book/Serial Number | Unique identifier fields, validation |
| **Accession Register** | Mandatory statutory register for all acquisitions | `lib_items.accession_number` — auto-generated sequential |
| **INFLIBNET** | National library network for e-resources | E-resource subscription tracking |
| **Barcode / RFID** | Item-level tracking | `lib_items.barcode` — unique per item |

---

## JKKN Terminology Standards

| NGL / Traditional Term | JKKN Standard Term | Code / DB Field |
|---|---|---|
| Library | **Learning Commons** | `learning_commons` (display only) |
| Librarian | **Knowledge Curator** | role: `knowledge_curator` |
| Library Assistant | **Knowledge Commons Associate** | role: `knowledge_commons_associate` |
| Patron / Member | **Knowledge Community Member** | `lib_members` table |
| Student member | **Learner Member** | `member_category: 'learner'` |
| Faculty member | **Learning Facilitator Member** | `member_category: 'facilitator'` |
| Book | **Learning Resource** | `lib_catalogue_records` |
| Physical copy | **Resource Item** | `lib_items` |
| Catalogue | **Knowledge Registry** | module name |
| Accession | **Resource Registration** | `accession_number` field |
| Issue / Check-out | **Resource Lending** | `lib_lending_transactions` |
| Return / Check-in | **Resource Return** | `returned_at` on transaction |
| Reservation / Hold | **Resource Hold** | `lib_resource_holds` |
| Fine / Overdue charge | **Late Return Charge** | `lib_late_charges` |
| Weed-out | **Resource Retirement** | `lib_retirement_requests` |
| ILL | **Inter-Campus Resource Sharing** | `lib_intercampus_requests` |
| OPAC | **Knowledge Discovery Portal** | module name |
| Reading Room | **Knowledge Hub** | facility label |
| Subscription | **Periodical Subscription** | `lib_periodical_subscriptions` |
| Serial / Journal | **Periodical Resource** | `resource_format: 'periodical'` |
| Vendor | **Resource Supplier** | `lib_suppliers` |
| Purchase Order | **Resource Procurement Order** | `lib_procurement_orders` |
| Budget | **Resource Acquisition Budget** | `lib_budget_allocations` |
| Binding | **Resource Conservation** | `lib_conservation_requests` |
| Shelf | **Knowledge Shelf** | `lib_locations` |
| Report | **Learning Commons Report** | module name |

---

## Domain Overview

### What MyjkknLIB Does

MyjkknLIB manages the complete lifecycle of knowledge resources in a JKKN institution's Learning Commons:

1. **Resource Acquisition** — purchase requests → quotations → procurement orders → receiving → accession registration
2. **Knowledge Registry (Cataloguing)** — MARC-compatible bibliographic records with DDC classification; physical item copies linked to records
3. **Resource Sharing (Circulation)** — lending, returns, holds, renewals, late charges, inter-campus requests
4. **Periodicals Management** — journal/magazine subscriptions, issue prediction, receipt tracking, binding
5. **Knowledge Discovery Portal (OPAC)** — learner-facing search across all catalogued resources
6. **Digital Resources** — e-book, e-journal, and database links; INFLIBNET tracking
7. **Reports & Accreditation** — NAAC Criterion 4 metrics, accession register, usage statistics

### Member Integration with MyJKKN

Learner and learning facilitator profiles are **not stored locally** — they are fetched from the MyJKKN API (same pattern as COE). Only `learner_id` / `facilitator_id` are stored as foreign keys in `lib_members`.

---

## Database Schema

### Table: `lib_members`

Knowledge Community Members — links to MyJKKN for profile data.

```sql
CREATE TABLE lib_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  member_number         TEXT NOT NULL,              -- e.g., "LIB-2024-001" (auto-generated)
  member_category       TEXT NOT NULL CHECK (member_category IN (
    'learner', 'facilitator', 'team_member', 'guest', 'alumni'
  )),
  -- MyJKKN references (no local profile duplication)
  learner_id            UUID,                        -- if learner
  facilitator_id        UUID,                        -- if facilitator
  team_member_id        UUID,                        -- if team member
  -- Local overrides (only for guest / alumni not in MyJKKN)
  display_name          TEXT,
  email                 TEXT,
  phone                 TEXT,
  -- Membership
  membership_start_date DATE NOT NULL,
  membership_end_date   DATE,
  is_active             BOOLEAN DEFAULT true,
  is_delinquent         BOOLEAN DEFAULT false,       -- has unpaid late charges
  -- Audit
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,

  UNIQUE(institution_id, member_number)
);
```

### Table: `lib_member_categories`

Configurable circulation privileges per member category.

```sql
CREATE TABLE lib_member_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  category_code         TEXT NOT NULL,              -- e.g., "learner", "facilitator"
  category_name         TEXT NOT NULL,              -- "Learner Member"
  max_items_allowed     INTEGER NOT NULL DEFAULT 3,
  loan_period_days      INTEGER NOT NULL DEFAULT 14,
  renewal_limit         INTEGER NOT NULL DEFAULT 2,
  renewal_period_days   INTEGER NOT NULL DEFAULT 7,
  late_charge_per_day   NUMERIC(8,2) DEFAULT 1.00,
  reservation_limit     INTEGER DEFAULT 2,
  can_access_digital    BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(institution_id, category_code)
);
```

### Table: `lib_locations`

Knowledge Shelf locations (DDC-based stacks, sections).

```sql
CREATE TABLE lib_locations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  location_code         TEXT NOT NULL,              -- e.g., "GEN", "REF", "PER"
  location_name         TEXT NOT NULL,              -- "General Stack", "Reference Section"
  floor                 TEXT,
  section               TEXT,
  is_lendable           BOOLEAN DEFAULT true,       -- false for reference-only
  is_active             BOOLEAN DEFAULT true,
  sort_order            INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(institution_id, location_code)
);
```

### Table: `lib_catalogue_records`

Core bibliographic records — Knowledge Registry. MARC-compatible via `marc_data` JSONB.

```sql
CREATE TABLE lib_catalogue_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),

  -- Identification
  title                 TEXT NOT NULL,
  subtitle              TEXT,
  resource_format       TEXT NOT NULL CHECK (resource_format IN (
    'book', 'periodical', 'thesis', 'report', 'map', 'audio',
    'video', 'digital', 'manuscript', 'standard', 'patent', 'other'
  )),
  isbn                  TEXT,                       -- books
  issn                  TEXT,                       -- periodicals
  edition               TEXT,
  volume_number         TEXT,
  publication_year      INTEGER,
  language              TEXT DEFAULT 'English',

  -- Classification (DDC standard in India)
  classification_number TEXT,                       -- DDC number e.g., "519.5"
  call_number           TEXT,                       -- full call number e.g., "519.5 SHA"
  subject_headings      TEXT[],                     -- array of subject terms

  -- Bibliographic detail
  publisher_name        TEXT,
  publisher_place       TEXT,
  series_title          TEXT,
  pages                 INTEGER,
  price                 NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',

  -- MARC full record (for import/export compatibility)
  marc_data             JSONB,

  -- NGL-equivalent: shelf life and circulation policy override
  default_loan_days     INTEGER,                    -- null = use category default
  is_reference_only     BOOLEAN DEFAULT false,

  -- Status
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID
);

-- Indexes for OPAC search
CREATE INDEX idx_lib_catalogue_title ON lib_catalogue_records USING gin(to_tsvector('english', title));
CREATE INDEX idx_lib_catalogue_isbn ON lib_catalogue_records(isbn);
CREATE INDEX idx_lib_catalogue_issn ON lib_catalogue_records(issn);
CREATE INDEX idx_lib_catalogue_classification ON lib_catalogue_records(classification_number);
```

### Table: `lib_catalogue_authors`

Separate author table (supports multiple authors per record).

```sql
CREATE TABLE lib_catalogue_authors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  author_name           TEXT NOT NULL,
  author_type           TEXT CHECK (author_type IN ('primary', 'secondary', 'editor', 'translator', 'illustrator')),
  sort_order            INTEGER DEFAULT 0
);
CREATE INDEX idx_lib_catalogue_authors ON lib_catalogue_authors(catalogue_record_id);
```

### Table: `lib_items`

Physical resource items — one row per physical copy. The accession register.

```sql
CREATE TABLE lib_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  location_id           UUID REFERENCES lib_locations(id),

  -- Statutory identifiers
  accession_number      TEXT NOT NULL,              -- e.g., "ACC/2024/00001" — statutory register
  barcode               TEXT,                       -- for scanner-based circulation
  copy_number           INTEGER DEFAULT 1,          -- copy 1, 2, 3 of same title

  -- Physical details
  condition             TEXT CHECK (condition IN ('new', 'good', 'fair', 'poor', 'damaged', 'lost')),
  price                 NUMERIC(10,2),
  invoice_cost          NUMERIC(10,2),
  mrp_value             NUMERIC(10,2),
  discount              NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',

  -- Acquisition linkage
  procurement_item_id   UUID,                       -- FK to lib_procurement_items
  supplier_id           UUID,                       -- FK to lib_suppliers
  date_received         DATE,
  invoice_number        TEXT,

  -- Status
  status                TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
    'available', 'on_loan', 'on_hold', 'on_order', 'in_conservation',
    'lost', 'damaged', 'retired', 'missing'
  )),
  is_lendable           BOOLEAN DEFAULT true,
  is_active             BOOLEAN DEFAULT true,

  -- Audit
  accession_date        DATE DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,

  UNIQUE(institution_id, accession_number),
  UNIQUE(institution_id, barcode)
);

CREATE INDEX idx_lib_items_catalogue ON lib_items(catalogue_record_id);
CREATE INDEX idx_lib_items_status ON lib_items(institution_id, status);
```

### Table: `lib_lending_transactions`

Resource lending and return log — core circulation.

```sql
CREATE TABLE lib_lending_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  item_id               UUID NOT NULL REFERENCES lib_items(id),
  member_id             UUID NOT NULL REFERENCES lib_members(id),

  -- Lending details
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date              DATE NOT NULL,
  issued_by             UUID,                       -- staff who issued

  -- Return details
  returned_at           TIMESTAMPTZ,
  returned_by           UUID,                       -- staff who received
  return_condition      TEXT,

  -- Renewal tracking
  renewal_count         INTEGER DEFAULT 0,
  last_renewed_at       TIMESTAMPTZ,

  -- Status
  transaction_status    TEXT NOT NULL DEFAULT 'active' CHECK (transaction_status IN (
    'active', 'returned', 'overdue', 'lost_by_member', 'recalled'
  )),

  -- Audit
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lib_lending_member ON lib_lending_transactions(member_id, transaction_status);
CREATE INDEX idx_lib_lending_item ON lib_lending_transactions(item_id, transaction_status);
CREATE INDEX idx_lib_lending_due ON lib_lending_transactions(due_date) WHERE transaction_status = 'active';
```

### Table: `lib_resource_holds`

Resource hold / reservation requests.

```sql
CREATE TABLE lib_resource_holds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  member_id             UUID NOT NULL REFERENCES lib_members(id),
  item_id               UUID REFERENCES lib_items(id),  -- assigned when item becomes available

  hold_placed_at        TIMESTAMPTZ DEFAULT now(),
  hold_expires_at       DATE,
  notified_at           TIMESTAMPTZ,               -- when member was notified
  checked_out_at        TIMESTAMPTZ,               -- if fulfilled

  hold_status           TEXT NOT NULL DEFAULT 'pending' CHECK (hold_status IN (
    'pending', 'available', 'fulfilled', 'cancelled', 'expired'
  )),
  cancellation_reason   TEXT,
  placed_by             UUID,                      -- staff or self-service

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_late_charges`

Late Return Charges (fines) — NGL: `cir_transaction_fine`.

```sql
CREATE TABLE lib_late_charges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  transaction_id        UUID NOT NULL REFERENCES lib_lending_transactions(id),
  member_id             UUID NOT NULL REFERENCES lib_members(id),

  overdue_days          INTEGER NOT NULL,
  charge_per_day        NUMERIC(8,2) NOT NULL,
  total_charge          NUMERIC(10,2) NOT NULL,
  waiver_amount         NUMERIC(10,2) DEFAULT 0,
  net_payable           NUMERIC(10,2) NOT NULL,

  payment_status        TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
    'unpaid', 'paid', 'waived', 'partial'
  )),
  payment_date          DATE,
  payment_reference     TEXT,
  collected_by          UUID,
  waiver_reason         TEXT,
  waiver_approved_by    UUID,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_suppliers`

Resource Suppliers — NGL: `adm_co_vendor`.

```sql
CREATE TABLE lib_suppliers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
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
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(institution_id, supplier_code)
);
```

### Table: `lib_budget_heads`

Resource Acquisition Budget — NGL: `acc_budget_head` + `acc_budget_source`.

```sql
CREATE TABLE lib_budget_heads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  fiscal_year           TEXT NOT NULL,             -- e.g., "2024-25"
  budget_head_code      TEXT NOT NULL,
  budget_head_name      TEXT NOT NULL,
  resource_type         TEXT CHECK (resource_type IN (
    'books', 'periodicals', 'digital', 'binding', 'equipment', 'other'
  )),
  allocated_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_amount          NUMERIC(14,2) DEFAULT 0,
  committed_amount      NUMERIC(14,2) DEFAULT 0,  -- on order but not yet paid
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(institution_id, fiscal_year, budget_head_code)
);
```

### Table: `lib_procurement_requests`

Resource acquisition requests — NGL: `acq_request_am`.

```sql
CREATE TABLE lib_procurement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  request_number        TEXT NOT NULL,
  requested_by          UUID,                      -- member_id or staff_id

  -- Bibliographic info (may not yet have catalogue record)
  title                 TEXT NOT NULL,
  author                TEXT,
  publisher             TEXT,
  edition               TEXT,
  isbn                  TEXT,
  resource_format       TEXT DEFAULT 'book',
  quantity              INTEGER NOT NULL DEFAULT 1,
  estimated_price       NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',
  budget_head_id        UUID REFERENCES lib_budget_heads(id),

  -- Justification
  purpose               TEXT,
  department            TEXT,                      -- requesting department
  priority              TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Workflow status
  request_status        TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN (
    'pending', 'approved', 'rejected', 'ordered', 'received', 'cancelled'
  )),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,

  -- Linked to catalogue record after receipt
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id),

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE(institution_id, request_number)
);
```

### Table: `lib_procurement_orders`

Resource Procurement Orders — NGL: `acq_order`.

```sql
CREATE TABLE lib_procurement_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  order_number          TEXT NOT NULL,
  supplier_id           UUID NOT NULL REFERENCES lib_suppliers(id),
  budget_head_id        UUID REFERENCES lib_budget_heads(id),
  fiscal_year           TEXT,
  order_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  order_type            TEXT DEFAULT 'firm' CHECK (order_type IN ('firm', 'on_approval', 'gift', 'exchange')),
  total_amount          NUMERIC(14,2),
  currency_code         TEXT DEFAULT 'INR',
  order_status          TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN (
    'draft', 'placed', 'acknowledged', 'partially_received', 'received', 'cancelled', 'claimed'
  )),
  claim_date            DATE,                      -- for overdue orders
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,

  UNIQUE(institution_id, order_number)
);
```

### Table: `lib_procurement_items`

Line items in a procurement order.

```sql
CREATE TABLE lib_procurement_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  order_id              UUID NOT NULL REFERENCES lib_procurement_orders(id) ON DELETE CASCADE,
  request_id            UUID REFERENCES lib_procurement_requests(id),
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id),

  title                 TEXT NOT NULL,
  isbn                  TEXT,
  quantity_ordered      INTEGER NOT NULL DEFAULT 1,
  quantity_received     INTEGER DEFAULT 0,
  unit_price            NUMERIC(10,2),
  discount_percent      NUMERIC(5,2) DEFAULT 0,
  net_price             NUMERIC(10,2),
  total_price           NUMERIC(10,2),
  item_status           TEXT DEFAULT 'pending' CHECK (item_status IN (
    'pending', 'received', 'cancelled', 'claimed'
  )),
  created_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_periodical_subscriptions`

Periodical Subscriptions — NGL: `sm_subscription`.

```sql
CREATE TABLE lib_periodical_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  supplier_id           UUID REFERENCES lib_suppliers(id),
  budget_head_id        UUID REFERENCES lib_budget_heads(id),

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
  currency_code         TEXT DEFAULT 'INR',

  -- Volume/issue tracking
  start_volume          TEXT,
  start_issue           TEXT,
  expected_issues       INTEGER,
  received_issues       INTEGER DEFAULT 0,

  -- Access (for online)
  access_url            TEXT,
  login_id              TEXT,
  password_hint         TEXT,

  subscription_status   TEXT DEFAULT 'active' CHECK (subscription_status IN (
    'active', 'expired', 'cancelled', 'gratis', 'suspended'
  )),
  is_gratis             BOOLEAN DEFAULT false,     -- received free

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_periodical_issues`

Individual issues received — NGL: `sm_registration`.

```sql
CREATE TABLE lib_periodical_issues (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  subscription_id       UUID NOT NULL REFERENCES lib_periodical_subscriptions(id),
  item_id               UUID REFERENCES lib_items(id),  -- physical item created on receipt

  volume_number         TEXT,
  issue_number          TEXT,
  issue_date            DATE,
  received_date         DATE DEFAULT CURRENT_DATE,
  cover_date            TEXT,
  pages                 INTEGER,

  receipt_status        TEXT DEFAULT 'received' CHECK (receipt_status IN (
    'expected', 'received', 'missing', 'claimed', 'duplicate'
  )),
  is_bound              BOOLEAN DEFAULT false,
  bound_volume_id       UUID,                      -- FK to conservation record

  created_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_digital_resources`

E-resources, databases, e-journals — INFLIBNET, N-LIST etc.

```sql
CREATE TABLE lib_digital_resources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  resource_title        TEXT NOT NULL,
  resource_type         TEXT NOT NULL CHECK (resource_type IN (
    'ebook', 'ejournal', 'database', 'open_access', 'inflibnet', 'institutional_repository', 'other'
  )),
  provider              TEXT,                      -- e.g., "INFLIBNET N-LIST", "Springer", "JSTOR"
  access_url            TEXT NOT NULL,
  username              TEXT,
  password_hint         TEXT,
  coverage_years        TEXT,                      -- e.g., "2010-present"
  subject_areas         TEXT[],
  subscription_start    DATE,
  subscription_end      DATE,
  annual_cost           NUMERIC(10,2),
  concurrent_users      INTEGER,
  is_active             BOOLEAN DEFAULT true,
  is_open_access        BOOLEAN DEFAULT false,
  naac_reportable       BOOLEAN DEFAULT true,      -- count in NAAC 4.2 reports
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_member_visits`

Learner footfall — NAAC Criterion 4.2.5.

```sql
CREATE TABLE lib_member_visits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  member_id             UUID REFERENCES lib_members(id),   -- null for walk-in
  visit_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time            TIMETZ,
  exit_time             TIMETZ,
  visit_purpose         TEXT CHECK (visit_purpose IN (
    'reading', 'borrowing', 'returning', 'research', 'opac', 'digital', 'other'
  )),
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lib_visits_date ON lib_member_visits(institution_id, visit_date);
```

### Table: `lib_retirement_requests`

Resource Retirement (Weed-out) — NGL: `cir_weedout_material`.

```sql
CREATE TABLE lib_retirement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  item_id               UUID NOT NULL REFERENCES lib_items(id),
  reason                TEXT NOT NULL,             -- obsolete, damaged, duplicate, etc.
  condition_at_retirement TEXT,
  recommended_by        UUID,                      -- staff who recommended
  approved_by           UUID,
  approval_date         DATE,
  retirement_status     TEXT DEFAULT 'pending' CHECK (retirement_status IN (
    'pending', 'approved', 'rejected', 'completed'
  )),
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_intercampus_requests`

Inter-Campus Resource Sharing — NGL: `inter_library_loan`.

```sql
CREATE TABLE lib_intercampus_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),   -- requesting institution
  providing_institution_id UUID REFERENCES institutions(id),          -- providing institution

  member_id             UUID NOT NULL REFERENCES lib_members(id),
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id),  -- if known

  -- Resource details (if not in catalogue)
  title                 TEXT NOT NULL,
  author                TEXT,
  isbn                  TEXT,

  -- Workflow
  request_date          TIMESTAMPTZ DEFAULT now(),
  due_date              DATE,
  returned_date         DATE,
  request_status        TEXT DEFAULT 'pending' CHECK (request_status IN (
    'pending', 'approved', 'dispatched', 'received', 'returned', 'rejected', 'lost'
  )),
  item_id               UUID REFERENCES lib_items(id),              -- assigned item

  request_note          TEXT,
  approved_note         TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### Table: `lib_conservation_requests`

Resource Conservation (Binding) — NGL: `cirbindingmgmt`.

```sql
CREATE TABLE lib_conservation_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  conservation_type     TEXT CHECK (conservation_type IN ('binding', 'repair', 'lamination', 'digitisation')),
  -- Items (books)
  item_id               UUID REFERENCES lib_items(id),
  -- Periodical volumes
  subscription_id       UUID REFERENCES lib_periodical_subscriptions(id),

  sent_to_binder        DATE,
  expected_return       DATE,
  actual_return         DATE,
  binder_name           TEXT,
  binder_invoice        TEXT,
  binding_cost          NUMERIC(10,2),
  conservation_status   TEXT DEFAULT 'identified' CHECK (conservation_status IN (
    'identified', 'sent', 'returned', 'cancelled'
  )),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

---

## Module Structure

```
MyjkknLIB/
│
├── types/
│   └── lib.ts                               # All LMS TypeScript interfaces
│
├── services/library/                        # Service layer (fetch-based, per project pattern)
│   ├── lib-members-service.ts
│   ├── lib-catalogue-service.ts
│   ├── lib-items-service.ts
│   ├── lib-circulation-service.ts           # lending, returns, holds, renewals
│   ├── lib-late-charges-service.ts
│   ├── lib-procurement-service.ts           # requests, orders, suppliers, budget
│   ├── lib-periodicals-service.ts           # subscriptions, issues
│   ├── lib-digital-service.ts
│   ├── lib-retirement-service.ts
│   ├── lib-intercampus-service.ts
│   └── lib-reports-service.ts              # NAAC metrics, accession register
│
├── hooks/library/                           # React hooks (useState + useCallback pattern)
│   ├── use-lib-members.ts
│   ├── use-lib-catalogue.ts
│   ├── use-lib-items.ts
│   ├── use-lib-circulation.ts
│   ├── use-lib-late-charges.ts
│   ├── use-lib-procurement.ts
│   ├── use-lib-periodicals.ts
│   ├── use-lib-digital.ts
│   └── use-lib-reports.ts
│
├── components/library/                      # Shared LMS UI components
│   ├── resource-status-badge.tsx            # available / on_loan / on_hold / retired
│   ├── member-category-badge.tsx            # learner / facilitator / team_member
│   ├── accession-label.tsx                  # printable accession label component
│   ├── barcode-scanner-input.tsx            # keyboard-wedge barcode input field
│   ├── catalogue-search-box.tsx             # full-text search with DDC filter
│   ├── item-availability-card.tsx           # shows copies available/on-loan per title
│   ├── late-charge-calculator.tsx           # real-time fine preview
│   ├── opac-result-card.tsx                 # single search result card
│   ├── naac-metric-card.tsx                 # metric display for accreditation dashboard
│   └── budget-utilisation-bar.tsx           # budget head spend vs allocated
│
├── app/(lib)/                               # LMS pages (separate route group from COE)
│   │
│   ├── layout.tsx                           # LMS navigation: Registry | Circulation | Acquisition | Periodicals | Digital | Reports
│   ├── page.tsx                             # Learning Commons Dashboard
│   │
│   ├── members/
│   │   ├── page.tsx                         # Member list with search + filter by category
│   │   └── _components/
│   │       ├── member-table.tsx
│   │       ├── member-form.tsx              # Sheet: create/edit member
│   │       └── membership-card.tsx          # Printable member card
│   │
│   ├── registry/                            # Knowledge Registry (Cataloguing)
│   │   ├── page.tsx                         # Catalogue record list
│   │   ├── _components/
│   │   │   ├── catalogue-table.tsx
│   │   │   ├── catalogue-form.tsx           # Tabbed: basic | authors | classification | MARC
│   │   │   └── marc-field-editor.tsx        # Key-value MARC field editor
│   │   └── [id]/
│   │       ├── page.tsx                     # Record detail + items list
│   │       └── _components/
│   │           ├── item-list.tsx            # All physical copies
│   │           └── item-form.tsx            # Add/edit item (accession)
│   │
│   ├── circulation/                         # Resource Sharing
│   │   ├── page.tsx                         # Circulation desk — barcode-driven
│   │   ├── _components/
│   │   │   ├── lending-panel.tsx            # Issue resource: scan barcode → confirm
│   │   │   ├── return-panel.tsx             # Return: scan → show charges → confirm
│   │   │   ├── renewal-panel.tsx
│   │   │   └── member-account-card.tsx      # Active loans, holds, charges for a member
│   │   ├── holds/
│   │   │   ├── page.tsx                     # All resource holds queue
│   │   │   └── _components/
│   │   │       └── holds-table.tsx
│   │   ├── overdue/
│   │   │   ├── page.tsx                     # Overdue items + batch charge calculation
│   │   │   └── _components/
│   │   │       └── overdue-table.tsx
│   │   └── charges/
│   │       ├── page.tsx                     # Late return charges — payment collection
│   │       └── _components/
│   │           ├── charges-table.tsx
│   │           └── payment-form.tsx
│   │
│   ├── acquisition/                         # Resource Acquisition
│   │   ├── page.tsx                         # Acquisition dashboard
│   │   ├── requests/
│   │   │   ├── page.tsx                     # Purchase requests list
│   │   │   └── _components/
│   │   │       ├── request-table.tsx
│   │   │       └── request-form.tsx
│   │   ├── orders/
│   │   │   ├── page.tsx                     # Procurement orders
│   │   │   └── _components/
│   │   │       ├── order-table.tsx
│   │   │       ├── order-form.tsx
│   │   │       └── order-items-table.tsx
│   │   ├── receive/
│   │   │   ├── page.tsx                     # Receive items → auto-create accession
│   │   │   └── _components/
│   │   │       └── receive-form.tsx
│   │   ├── suppliers/
│   │   │   ├── page.tsx
│   │   │   └── _components/
│   │   │       └── supplier-form.tsx
│   │   └── budget/
│   │       ├── page.tsx                     # Budget heads + utilisation
│   │       └── _components/
│   │           ├── budget-table.tsx
│   │           └── budget-form.tsx
│   │
│   ├── periodicals/                         # Periodicals Management
│   │   ├── page.tsx                         # Subscription list
│   │   ├── _components/
│   │   │   ├── subscription-table.tsx
│   │   │   └── subscription-form.tsx
│   │   └── [subscriptionId]/
│   │       ├── page.tsx                     # Subscription detail + issues register
│   │       └── _components/
│   │           ├── issues-table.tsx
│   │           └── receive-issue-form.tsx
│   │
│   ├── digital/                             # Digital Resources
│   │   ├── page.tsx                         # E-resources list (public-facing OPAC view)
│   │   └── _components/
│   │       ├── digital-resource-table.tsx
│   │       └── digital-resource-form.tsx
│   │
│   ├── opac/                                # Knowledge Discovery Portal
│   │   ├── page.tsx                         # OPAC search — full-text + filters
│   │   └── _components/
│   │       ├── opac-search-bar.tsx
│   │       ├── opac-filters.tsx             # Resource format, location, availability
│   │       ├── opac-results-list.tsx
│   │       └── opac-resource-detail.tsx     # Title detail + copy availability + hold button
│   │
│   ├── retirement/                          # Resource Retirement
│   │   ├── page.tsx
│   │   └── _components/
│   │       ├── retirement-table.tsx
│   │       └── retirement-form.tsx
│   │
│   ├── intercampus/                         # Inter-Campus Resource Sharing
│   │   ├── page.tsx
│   │   └── _components/
│   │       └── intercampus-table.tsx
│   │
│   ├── conservation/                        # Resource Conservation (Binding)
│   │   ├── page.tsx
│   │   └── _components/
│   │       └── conservation-table.tsx
│   │
│   └── reports/                             # Learning Commons Reports
│       ├── page.tsx                         # Report landing — accreditation dashboard
│       └── _components/
│           ├── naac-criterion4-panel.tsx    # NAAC 4.2 all metrics
│           ├── accession-register-table.tsx # Statutory accession register
│           ├── circulation-report.tsx       # Daily/monthly lending statistics
│           ├── overdue-report.tsx
│           ├── budget-utilisation-report.tsx
│           ├── member-activity-report.tsx
│           └── footfall-chart.tsx           # Learner visits per day/month
│
└── app/api/lib/                             # API Routes
    ├── members/
    │   ├── route.ts                          # GET, POST
    │   └── [id]/route.ts                    # GET, PUT, DELETE
    ├── catalogue/
    │   ├── route.ts
    │   ├── [id]/route.ts
    │   ├── [id]/items/route.ts              # Items for a catalogue record
    │   └── search/route.ts                  # Full-text OPAC search
    ├── items/
    │   ├── route.ts
    │   └── [id]/route.ts
    ├── circulation/
    │   ├── issue/route.ts                   # POST: lend item
    │   ├── return/route.ts                  # POST: return item
    │   ├── renew/route.ts                   # POST: renew loan
    │   ├── holds/route.ts                   # GET, POST
    │   ├── holds/[id]/route.ts              # PUT, DELETE
    │   └── overdue/route.ts                 # GET: compute overdue list
    ├── charges/
    │   ├── route.ts                         # GET: all charges for institution
    │   ├── [id]/route.ts                    # PUT: collect payment / waive
    │   └── calculate/route.ts               # POST: compute charge for transaction
    ├── procurement/
    │   ├── requests/route.ts
    │   ├── requests/[id]/route.ts
    │   ├── orders/route.ts
    │   ├── orders/[id]/route.ts
    │   ├── orders/[id]/receive/route.ts     # POST: receive items → create accession
    │   ├── suppliers/route.ts
    │   ├── suppliers/[id]/route.ts
    │   ├── budget/route.ts
    │   └── budget/[id]/route.ts
    ├── periodicals/
    │   ├── subscriptions/route.ts
    │   ├── subscriptions/[id]/route.ts
    │   └── subscriptions/[id]/issues/route.ts
    ├── digital/
    │   └── route.ts
    ├── visits/route.ts                      # POST: log footfall
    ├── retirement/route.ts
    ├── intercampus/route.ts
    ├── conservation/route.ts
    └── reports/
        ├── naac/route.ts                    # GET: NAAC Criterion 4.2 full package
        ├── accession-register/route.ts      # GET: statutory accession register export
        ├── circulation-summary/route.ts
        ├── budget-utilisation/route.ts
        └── overdue/route.ts
```

---

## TypeScript Interfaces

**File:** `types/lib.ts`

```typescript
// types/lib.ts

// ── Member ──────────────────────────────────────────────────────────

export type LibMemberCategory = 'learner' | 'facilitator' | 'team_member' | 'guest' | 'alumni'

export interface LibMember {
  id: string
  institution_id: string
  member_number: string
  member_category: LibMemberCategory
  learner_id?: string
  facilitator_id?: string
  team_member_id?: string
  display_name?: string
  email?: string
  phone?: string
  membership_start_date: string
  membership_end_date?: string
  is_active: boolean
  is_delinquent: boolean
  created_at: string
  updated_at: string
  // Joined from MyJKKN (not stored locally)
  photo_url?: string
  roll_number?: string
}

export interface LibMemberFilters {
  institution_id?: string
  member_category?: LibMemberCategory
  is_active?: boolean
  is_delinquent?: boolean
  search?: string
  page?: number
  limit?: number
}

// ── Catalogue / Resource ─────────────────────────────────────────────

export type LibResourceFormat =
  | 'book' | 'periodical' | 'thesis' | 'report' | 'map'
  | 'audio' | 'video' | 'digital' | 'manuscript' | 'standard' | 'patent' | 'other'

export interface LibCatalogueRecord {
  id: string
  institution_id: string
  title: string
  subtitle?: string
  resource_format: LibResourceFormat
  isbn?: string
  issn?: string
  edition?: string
  volume_number?: string
  publication_year?: number
  language?: string
  classification_number?: string
  call_number?: string
  subject_headings?: string[]
  publisher_name?: string
  publisher_place?: string
  series_title?: string
  pages?: number
  price?: number
  currency_code: string
  marc_data?: Record<string, unknown>
  default_loan_days?: number
  is_reference_only: boolean
  is_active: boolean
  created_at: string
  updated_at: string
  // Joined
  authors?: LibCatalogueAuthor[]
  item_count?: number
  available_count?: number
}

export interface LibCatalogueAuthor {
  id: string
  catalogue_record_id: string
  institution_id: string
  author_name: string
  author_type?: 'primary' | 'secondary' | 'editor' | 'translator' | 'illustrator'
  sort_order: number
}

export interface LibCatalogueFilters {
  institution_id?: string
  resource_format?: LibResourceFormat
  location_id?: string
  is_active?: boolean
  is_reference_only?: boolean
  search?: string
  classification_from?: string
  classification_to?: string
  publication_year_from?: number
  publication_year_to?: number
  page?: number
  limit?: number
}

// ── Item ─────────────────────────────────────────────────────────────

export type LibItemStatus =
  | 'available' | 'on_loan' | 'on_hold' | 'on_order' | 'in_conservation'
  | 'lost' | 'damaged' | 'retired' | 'missing'

export type LibItemCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged' | 'lost'

export interface LibItem {
  id: string
  institution_id: string
  catalogue_record_id: string
  location_id?: string
  accession_number: string
  barcode?: string
  copy_number: number
  condition?: LibItemCondition
  price?: number
  invoice_cost?: number
  mrp_value?: number
  discount?: number
  currency_code: string
  supplier_id?: string
  date_received?: string
  invoice_number?: string
  status: LibItemStatus
  is_lendable: boolean
  is_active: boolean
  accession_date: string
  created_at: string
  updated_at: string
  // Joined
  catalogue_record?: LibCatalogueRecord
  location?: LibLocation
}

// ── Circulation ──────────────────────────────────────────────────────

export type LibTransactionStatus = 'active' | 'returned' | 'overdue' | 'lost_by_member' | 'recalled'

export interface LibLendingTransaction {
  id: string
  institution_id: string
  item_id: string
  member_id: string
  issued_at: string
  due_date: string
  issued_by?: string
  returned_at?: string
  returned_by?: string
  return_condition?: string
  renewal_count: number
  last_renewed_at?: string
  transaction_status: LibTransactionStatus
  created_at: string
  updated_at: string
  // Joined
  item?: LibItem
  member?: LibMember
  overdue_days?: number
  late_charge_amount?: number
}

export interface LibResourceHold {
  id: string
  institution_id: string
  catalogue_record_id: string
  member_id: string
  item_id?: string
  hold_placed_at: string
  hold_expires_at?: string
  notified_at?: string
  checked_out_at?: string
  hold_status: 'pending' | 'available' | 'fulfilled' | 'cancelled' | 'expired'
  cancellation_reason?: string
  placed_by?: string
  created_at: string
  updated_at: string
  catalogue_record?: LibCatalogueRecord
  member?: LibMember
}

// ── Late Charges ──────────────────────────────────────────────────────

export type LibChargePaymentStatus = 'unpaid' | 'paid' | 'waived' | 'partial'

export interface LibLateCharge {
  id: string
  institution_id: string
  transaction_id: string
  member_id: string
  overdue_days: number
  charge_per_day: number
  total_charge: number
  waiver_amount: number
  net_payable: number
  payment_status: LibChargePaymentStatus
  payment_date?: string
  payment_reference?: string
  collected_by?: string
  waiver_reason?: string
  waiver_approved_by?: string
  created_at: string
  updated_at: string
  transaction?: LibLendingTransaction
  member?: LibMember
}

// ── Location ─────────────────────────────────────────────────────────

export interface LibLocation {
  id: string
  institution_id: string
  location_code: string
  location_name: string
  floor?: string
  section?: string
  is_lendable: boolean
  is_active: boolean
  sort_order: number
}

// ── Procurement ────────────────────────────────────────────────────────

export type LibProcurementRequestStatus =
  | 'pending' | 'approved' | 'rejected' | 'ordered' | 'received' | 'cancelled'

export type LibOrderStatus =
  | 'draft' | 'placed' | 'acknowledged' | 'partially_received' | 'received' | 'cancelled' | 'claimed'

export interface LibSupplier {
  id: string
  institution_id: string
  supplier_code: string
  supplier_name: string
  contact_person?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  gst_number?: string
  pan_number?: string
  payment_terms?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface LibBudgetHead {
  id: string
  institution_id: string
  fiscal_year: string
  budget_head_code: string
  budget_head_name: string
  resource_type?: 'books' | 'periodicals' | 'digital' | 'binding' | 'equipment' | 'other'
  allocated_amount: number
  spent_amount: number
  committed_amount: number
  is_active: boolean
  created_at: string
  updated_at: string
  // computed
  available_amount?: number
  utilisation_percent?: number
}

export interface LibProcurementRequest {
  id: string
  institution_id: string
  request_number: string
  requested_by?: string
  title: string
  author?: string
  publisher?: string
  edition?: string
  isbn?: string
  resource_format: string
  quantity: number
  estimated_price?: number
  currency_code: string
  budget_head_id?: string
  purpose?: string
  department?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  request_status: LibProcurementRequestStatus
  approved_by?: string
  approved_at?: string
  rejection_reason?: string
  catalogue_record_id?: string
  created_at: string
  updated_at: string
}

export interface LibProcurementOrder {
  id: string
  institution_id: string
  order_number: string
  supplier_id: string
  budget_head_id?: string
  fiscal_year?: string
  order_date: string
  expected_delivery_date?: string
  order_type: 'firm' | 'on_approval' | 'gift' | 'exchange'
  total_amount?: number
  currency_code: string
  order_status: LibOrderStatus
  claim_date?: string
  notes?: string
  created_at: string
  updated_at: string
  supplier?: LibSupplier
  items?: LibProcurementItem[]
}

export interface LibProcurementItem {
  id: string
  institution_id: string
  order_id: string
  request_id?: string
  catalogue_record_id?: string
  title: string
  isbn?: string
  quantity_ordered: number
  quantity_received: number
  unit_price?: number
  discount_percent?: number
  net_price?: number
  total_price?: number
  item_status: 'pending' | 'received' | 'cancelled' | 'claimed'
  created_at: string
}

// ── Periodicals ──────────────────────────────────────────────────────

export type LibSubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'gratis' | 'suspended'
export type LibIssueReceiptStatus = 'expected' | 'received' | 'missing' | 'claimed' | 'duplicate'

export interface LibPeriodicalSubscription {
  id: string
  institution_id: string
  catalogue_record_id: string
  supplier_id?: string
  budget_head_id?: string
  subscription_number?: string
  subscription_type?: 'print' | 'online' | 'both'
  frequency?: string
  fiscal_year: string
  start_date?: string
  end_date?: string
  subscription_cost?: number
  currency_code: string
  start_volume?: string
  start_issue?: string
  expected_issues?: number
  received_issues: number
  access_url?: string
  subscription_status: LibSubscriptionStatus
  is_gratis: boolean
  created_at: string
  updated_at: string
  catalogue_record?: LibCatalogueRecord
  supplier?: LibSupplier
}

export interface LibPeriodicalIssue {
  id: string
  institution_id: string
  subscription_id: string
  item_id?: string
  volume_number?: string
  issue_number?: string
  issue_date?: string
  received_date?: string
  cover_date?: string
  pages?: number
  receipt_status: LibIssueReceiptStatus
  is_bound: boolean
  created_at: string
}

// ── Digital Resources ─────────────────────────────────────────────────

export type LibDigitalResourceType =
  | 'ebook' | 'ejournal' | 'database' | 'open_access' | 'inflibnet' | 'institutional_repository' | 'other'

export interface LibDigitalResource {
  id: string
  institution_id: string
  resource_title: string
  resource_type: LibDigitalResourceType
  provider?: string
  access_url: string
  username?: string
  password_hint?: string
  coverage_years?: string
  subject_areas?: string[]
  subscription_start?: string
  subscription_end?: string
  annual_cost?: number
  concurrent_users?: number
  is_active: boolean
  is_open_access: boolean
  naac_reportable: boolean
  created_at: string
  updated_at: string
}

// ── Reports ──────────────────────────────────────────────────────────

export interface LibNaacCriterion4Report {
  institution_id: string
  academic_year: string
  total_volumes: number
  volumes_added_this_year: number
  total_titles: number
  print_journals_subscribed: number
  digital_resources_count: number
  inflibnet_databases: number
  annual_books_expenditure: number
  annual_journals_expenditure: number
  annual_digital_expenditure: number
  total_annual_expenditure: number
  daily_avg_footfall: number
  total_annual_visits: number
  active_members: number
  total_lending_transactions: number
  generated_at: string
}

export interface LibAccessionRegisterEntry {
  accession_number: string
  accession_date: string
  title: string
  author: string
  edition?: string
  publisher_name?: string
  publication_year?: number
  classification_number?: string
  call_number?: string
  price?: number
  supplier_name?: string
  invoice_number?: string
  budget_head?: string
  barcode?: string
  location_name?: string
}

export interface LibCirculationSummary {
  date: string
  items_issued: number
  items_returned: number
  renewals: number
  holds_placed: number
  charges_collected: number
}

// ── Shared filters ────────────────────────────────────────────────────

export interface LibListResponse<T> {
  data: T[]
  metadata: {
    total: number
    page: number
    limit: number
    total_pages: number
  }
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/lib/members` | List members with filters |
| POST | `/api/lib/members` | Create member |
| GET | `/api/lib/members/:id` | Member detail + active loans, holds, charges |
| PUT | `/api/lib/members/:id` | Update member |
| DELETE | `/api/lib/members/:id` | Deactivate member |
| GET | `/api/lib/catalogue` | List catalogue records with search |
| POST | `/api/lib/catalogue` | Create catalogue record |
| GET | `/api/lib/catalogue/:id` | Record detail with items |
| PUT | `/api/lib/catalogue/:id` | Update record |
| DELETE | `/api/lib/catalogue/:id` | Delete record |
| GET | `/api/lib/catalogue/search` | OPAC full-text search |
| GET | `/api/lib/catalogue/:id/items` | List physical items for a record |
| POST | `/api/lib/items` | Add item (accession) |
| PUT | `/api/lib/items/:id` | Update item |
| DELETE | `/api/lib/items/:id` | Retire item |
| POST | `/api/lib/circulation/issue` | Lend item to member |
| POST | `/api/lib/circulation/return` | Return item |
| POST | `/api/lib/circulation/renew` | Renew loan |
| GET | `/api/lib/circulation/holds` | List holds |
| POST | `/api/lib/circulation/holds` | Place hold |
| PUT | `/api/lib/circulation/holds/:id` | Update / cancel hold |
| GET | `/api/lib/circulation/overdue` | Compute overdue list |
| GET | `/api/lib/charges` | List late charges |
| PUT | `/api/lib/charges/:id` | Collect payment / waive |
| POST | `/api/lib/charges/calculate` | Preview charge for a transaction |
| GET | `/api/lib/procurement/requests` | List purchase requests |
| POST | `/api/lib/procurement/requests` | Create request |
| PUT | `/api/lib/procurement/requests/:id` | Approve / reject request |
| GET | `/api/lib/procurement/orders` | List procurement orders |
| POST | `/api/lib/procurement/orders` | Create order |
| PUT | `/api/lib/procurement/orders/:id` | Update order |
| POST | `/api/lib/procurement/orders/:id/receive` | Receive items → auto-accession |
| GET | `/api/lib/procurement/suppliers` | List suppliers |
| POST | `/api/lib/procurement/suppliers` | Create supplier |
| PUT | `/api/lib/procurement/suppliers/:id` | Update supplier |
| GET | `/api/lib/procurement/budget` | List budget heads |
| POST | `/api/lib/procurement/budget` | Create budget head |
| PUT | `/api/lib/procurement/budget/:id` | Update allocation |
| GET | `/api/lib/periodicals/subscriptions` | List subscriptions |
| POST | `/api/lib/periodicals/subscriptions` | Create subscription |
| PUT | `/api/lib/periodicals/subscriptions/:id` | Update subscription |
| GET | `/api/lib/periodicals/subscriptions/:id/issues` | List issues for subscription |
| POST | `/api/lib/periodicals/subscriptions/:id/issues` | Register received issue |
| GET | `/api/lib/digital` | List digital resources |
| POST | `/api/lib/digital` | Add digital resource |
| PUT | `/api/lib/digital/:id` | Update |
| DELETE | `/api/lib/digital/:id` | Remove |
| POST | `/api/lib/visits` | Log member visit (footfall) |
| GET | `/api/lib/reports/naac` | NAAC Criterion 4.2 full report |
| GET | `/api/lib/reports/accession-register` | Statutory accession register (Excel) |
| GET | `/api/lib/reports/circulation-summary` | Daily / monthly circulation stats |
| GET | `/api/lib/reports/budget-utilisation` | Budget head spend report |
| GET | `/api/lib/reports/overdue` | Current overdue list |

---

## Key UI Screens

### 1. Learning Commons Dashboard
- Summary cards: Total titles, total volumes, on-loan today, overdue items, members, late charges pending
- Quick actions: Issue resource, Return resource, Add accession, Search catalogue
- Budget utilisation bars per head
- Recent acquisitions list
- Overdue alerts
- Filter by institution (super_admin)

### 2. Knowledge Registry (Catalogue)
- Data table: title, author, format badge, call number, copies (available / total)
- Filters: resource format, location, availability, publication year range, classification range
- Full-text search across title, author, ISBN, subject headings
- Add / Edit: Tabbed form — Basic Info | Authors | Classification | Holdings | MARC Data
- Record detail: bibliographic info + all items list with status badges

### 3. Circulation Desk
- Split panel: Issue | Return | Renew tabs
- Barcode scanner input field (auto-focus, keyboard-wedge compatible)
- Member lookup: scan member barcode or search by name/roll number
- Issue flow: scan item barcode → show title, due date → confirm → print receipt
- Return flow: scan item → show member, overdue days, charge → collect payment → confirm
- Member account card: active loans, pending holds, unpaid charges, delinquent flag

### 4. Overdue Management
- Table: member name, roll number, item title, due date, overdue days, charge
- Bulk notify (email) members with overdue items
- Batch charge calculation
- Export overdue list (Excel)

### 5. Resource Acquisition
- Purchase request list → approval workflow → order generation
- Procurement order with line items; status tracking (placed → received)
- Receive items page: mark quantities received, auto-generate accession numbers and create `lib_items`
- Budget head utilisation: allocated vs committed vs spent per head per fiscal year

### 6. Periodicals Management
- Subscription list with status badges (active / expired / gratis)
- Issue receipt log per subscription: volume, issue, date received, status (received / missing / claimed)
- Missing issue claim: generate claim letter to supplier
- Conservation: send volumes for binding, track return

### 7. Knowledge Discovery Portal (OPAC)
- Public-facing search: title, author, keyword, ISBN, classification number
- Filters: format, location, availability, language, publication year
- Result card: cover placeholder, title, author, publisher, call number, availability chip
- Resource detail: full bibliographic info + copy-wise availability table + Place Hold button
- Learner self-service: My Loans, My Holds, My Charges (when logged in via MyJKKN)

### 8. Digital Resources
- Grid of e-resources with type badge, provider, subject areas, access button
- NAAC-reportable toggle
- INFLIBNET / N-LIST database tracking
- Access URL management with username hints

### 9. NAAC Reports (Criterion 4.2)
- Auto-computed metrics for selected academic year:
  - 4.2.1: ILS system details
  - 4.2.2: E-resources / databases subscribed
  - 4.2.3: Annual expenditure breakdown (books / journals / digital)
  - 4.2.4: Books added per year (with accession date filter)
  - 4.2.5: Daily average footfall
  - 4.2.6: Digital resource count
- Export as Excel (.xlsx) for NAAC SSR submission
- Accession register: statutory format export with all required columns

---

## Validation Rules

| Rule | Details |
|---|---|
| Accession number unique | `UNIQUE(institution_id, accession_number)` — auto-generated, never manual |
| Barcode unique | `UNIQUE(institution_id, barcode)` — prevent duplicate scan |
| Lending limit | Check `max_items_allowed` from `lib_member_categories` before issuing |
| Delinquent block | Members with `is_delinquent = true` cannot borrow until charges cleared |
| Duplicate hold | Member cannot place two holds on the same catalogue record |
| Item must be available | `lib_items.status = 'available'` required before lending |
| Due date calculation | `CURRENT_DATE + loan_period_days` from member category; exclude holidays |
| Budget overrun warning | Warn (not block) when procurement would exceed budget head allocation |
| Weightage sum (periodicals) | Expected issues × frequency must match subscription period |
| Renewal limit | `renewal_count < renewal_limit` from member category before allowing renewal |
| Return condition required | If condition = 'damaged' or 'lost', trigger late charge at replacement cost |
| MARC ISBN format | ISBN-13 must pass check-digit validation |
| ISSN format | Must match `\d{4}-\d{3}[\dX]` |
| Retirement requires approval | `retirement_status` cannot move to 'completed' without `approved_by` |
| Charge waiver requires authority | `waiver_amount > 0` requires `waiver_approved_by` to be set |

---

## RLS Policies

All tables require `institution_id` scoping. Role-based access:

| Role | Access |
|---|---|
| `knowledge_curator` | Full access: catalogue, circulation, procurement, periodicals, reports |
| `knowledge_commons_associate` | Circulation only: issue, return, renew, holds, charges |
| `learning_facilitator` | Read catalogue + OPAC; submit purchase requests; view own loans |
| `learner` | OPAC read only; view own loans/holds/charges via portal |
| `super_admin` | Full access across all institutions |

```sql
-- Example for lib_lending_transactions
ALTER TABLE lib_lending_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lib_lending_institution_scope"
  ON lib_lending_transactions FOR ALL
  USING (institution_id = (
    SELECT institution_id FROM profiles WHERE id = auth.uid()
  ));

-- Learner self-service: view only own transactions
CREATE POLICY "lib_lending_learner_own"
  ON lib_lending_transactions FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM lib_members WHERE learner_id = auth.uid()
    )
  );
```

---

## 5-Layer Development Spec

### Layer 1: Types (`types/lib.ts`)
> See full interface definitions above. Single file, all LMS types.

### Layer 2: Services (`services/library/`)

Follow the project's existing `services/master/regulations-service.ts` pattern — plain `async function` exports using `fetch()` against API routes, not direct Supabase calls.

```typescript
// services/library/lib-circulation-service.ts

import type { LibLendingTransaction, LibResourceHold, LibListResponse } from '@/types/lib'

export async function issueItem(payload: {
  item_id: string
  member_id: string
  institution_id: string
}): Promise<LibLendingTransaction> {
  const res = await fetch('/api/lib/circulation/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to issue resource')
  }
  return res.json()
}

export async function returnItem(payload: {
  item_id: string
  return_condition?: string
}): Promise<{ transaction: LibLendingTransaction; late_charge?: number }> {
  const res = await fetch('/api/lib/circulation/return', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to return resource')
  }
  return res.json()
}

export async function fetchOverdue(institutionId: string): Promise<LibLendingTransaction[]> {
  const res = await fetch(`/api/lib/circulation/overdue?institution_id=${institutionId}`)
  if (!res.ok) throw new Error('Failed to fetch overdue list')
  return res.json()
}
```

### Layer 3: Hooks (`hooks/library/`)

Follow the project's `useState + useCallback + useEffect` pattern (no React Query).

```typescript
// hooks/library/use-lib-circulation.ts
'use client'

import { useState, useCallback } from 'react'
import { toast } from '@/components/ui/use-toast'
import { issueItem, returnItem, fetchOverdue } from '@/services/library/lib-circulation-service'
import type { LibLendingTransaction } from '@/types/lib'

export function useLibCirculation(institutionId: string) {
  const [loading, setLoading] = useState(false)
  const [overdueList, setOverdueList] = useState<LibLendingTransaction[]>([])

  const lendResource = useCallback(async (itemId: string, memberId: string) => {
    try {
      setLoading(true)
      const tx = await issueItem({ item_id: itemId, member_id: memberId, institution_id: institutionId })
      toast({ title: '✅ Resource Issued', description: `Due: ${tx.due_date}`, className: 'bg-green-50 border-green-200 text-green-800' })
      return tx
    } catch (err) {
      toast({ title: '❌ Issue Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
      throw err
    } finally {
      setLoading(false)
    }
  }, [institutionId])

  const returnResource = useCallback(async (itemId: string, condition?: string) => {
    try {
      setLoading(true)
      const result = await returnItem({ item_id: itemId, return_condition: condition })
      if (result.late_charge && result.late_charge > 0) {
        toast({ title: '⚠️ Late Return Charge', description: `₹${result.late_charge.toFixed(2)} due`, className: 'bg-amber-50 border-amber-200 text-amber-800' })
      } else {
        toast({ title: '✅ Resource Returned', className: 'bg-green-50 border-green-200 text-green-800' })
      }
      return result
    } catch (err) {
      toast({ title: '❌ Return Failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' })
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const loadOverdue = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchOverdue(institutionId)
      setOverdueList(data)
    } finally {
      setLoading(false)
    }
  }, [institutionId])

  return { loading, overdueList, lendResource, returnResource, loadOverdue }
}
```

### Layer 4: Components (`components/library/`)

Key components:

**`resource-status-badge.tsx`** — maps `LibItemStatus` to colour chip
```tsx
const STATUS_CONFIG: Record<LibItemStatus, { label: string; className: string }> = {
  available:       { label: 'Available',         className: 'bg-green-100 text-green-700 border-green-200' },
  on_loan:         { label: 'On Loan',            className: 'bg-blue-100 text-blue-700 border-blue-200' },
  on_hold:         { label: 'On Hold',            className: 'bg-amber-100 text-amber-700 border-amber-200' },
  on_order:        { label: 'On Order',           className: 'bg-purple-100 text-purple-700 border-purple-200' },
  in_conservation: { label: 'In Conservation',   className: 'bg-orange-100 text-orange-700 border-orange-200' },
  lost:            { label: 'Lost',               className: 'bg-red-100 text-red-700 border-red-200' },
  damaged:         { label: 'Damaged',            className: 'bg-red-200 text-red-800 border-red-300' },
  retired:         { label: 'Retired',            className: 'bg-gray-100 text-gray-600 border-gray-200' },
  missing:         { label: 'Missing',            className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
}
```

**`barcode-scanner-input.tsx`** — auto-focus text input that reads keyboard-wedge barcodes and fires `onScan(value)` on Enter key.

**`late-charge-calculator.tsx`** — given a due date, computes real-time overdue days × daily rate and displays the preview charge before confirming return.

**`naac-metric-card.tsx`** — displays single NAAC criterion metric with label, value, target, and a green/amber/red indicator.

### Layer 5: Pages (`app/(lib)/`)

Page template (`app/(lib)/circulation/page.tsx`):

```tsx
'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { BarcodeScanner Input } from '@/components/library/barcode-scanner-input'
import { useLibCirculation } from '@/hooks/library/use-lib-circulation'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { ProtectedRoute } from '@/components/auth/protected-route'

export default function CirculationDeskPage() {
  const { institutionId } = useInstitutionFilter()
  const { lendResource, returnResource, loading } = useLibCirculation(institutionId ?? '')

  return (
    <ProtectedRoute requiredRoles={['knowledge_curator', 'knowledge_commons_associate']}>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-semibold">Circulation Desk</h1>
        <Tabs defaultValue="issue">
          <TabsList>
            <TabsTrigger value="issue">Resource Lending</TabsTrigger>
            <TabsTrigger value="return">Resource Return</TabsTrigger>
            <TabsTrigger value="renew">Renewal</TabsTrigger>
          </TabsList>
          <TabsContent value="issue">
            {/* BarcodeScannerInput → member lookup → item scan → confirm */}
          </TabsContent>
          <TabsContent value="return">
            {/* BarcodeScannerInput → show transaction → late charge preview → confirm */}
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  )
}
```

---

## Accession Number Format

Auto-generated on item creation. Format: `{INSTITUTION_CODE}/{RESOURCE_TYPE_CODE}/{FISCAL_YEAR}/{SEQUENCE}`

| Example | Breakdown |
|---|---|
| `JKKN/BK/2024-25/00001` | JKKN institution, Book, FY 2024-25, first item |
| `JKKN/PER/2024-25/00045` | Periodical, 45th item |
| `ARTS/BK/2024-25/00123` | Arts College, Book |

Sequence is per `(institution_id, resource_type_code, fiscal_year)` — resets each fiscal year. Stored in a `lib_accession_sequences` counter table with atomic increment.

---

## Implementation Phases

### Phase 1: Foundation — Database + Types + Setup
1. Create all Supabase tables (migration)
2. Create RLS policies for all lib_ tables
3. Seed: `lib_locations` (General, Reference, Periodicals, Digital), `lib_member_categories` (learner, facilitator, team_member)
4. Create `types/lib.ts`
5. Build `lib-members` CRUD pages (mirrors COE master page pattern)
6. Member integration: fetch photo/details from MyJKKN API using `learner_id`

### Phase 2: Knowledge Registry (Cataloguing)
1. `lib_catalogue_records` + `lib_catalogue_authors` CRUD pages
2. Catalogue form: tabbed (basic | authors | classification | MARC)
3. `lib_items` (physical copies) management — add item to record, print accession label
4. Accession number auto-generation (atomic sequence per institution + type + fiscal year)
5. Barcode label print component

### Phase 3: Circulation
1. Circulation desk page (issue / return / renew tabs with barcode scanner input)
2. Issue flow: member lookup → item availability check → lending limit check → create `lib_lending_transactions`
3. Return flow: scan → compute overdue days → create `lib_late_charges` if overdue → update item status
4. Renewal: check renewal count limit → extend due date
5. Resource holds queue management
6. Overdue management + bulk email notification
7. Late charge collection and waiver workflow

### Phase 4: Procurement & Budget
1. Resource supplier management
2. Budget head setup per fiscal year
3. Purchase request workflow (submit → approve → order)
4. Procurement order management with line items
5. Receive items → auto-create accession records
6. Budget utilisation tracking

### Phase 5: Periodicals & Digital
1. Periodical subscription management
2. Issue receipt log (volume/issue register)
3. Missing issue claims
4. Conservation (binding) request workflow
5. Digital resources catalogue (e-resources, INFLIBNET, databases)
6. Learner-facing digital resources browsing

### Phase 6: OPAC — Knowledge Discovery Portal
1. Full-text catalogue search (PostgreSQL `tsvector` index)
2. Faceted filters (format, location, availability, year)
3. Resource detail page with copy-wise availability
4. Learner self-service: My Loans, My Holds, My Charges
5. Online hold placement (authenticated learners)

### Phase 7: Reports & Accreditation
1. NAAC Criterion 4.2 dashboard with all six metrics auto-computed
2. Statutory Accession Register export (Excel — standard Indian library format)
3. Circulation summary reports (daily, monthly, yearly)
4. Budget utilisation report per fiscal year
5. Overdue report with age analysis
6. Member activity report
7. Footfall analytics (learner visits per day/month)
8. NBA library adequacy report (volumes per learner strength)

---

## Open Questions (Clarify Before Implementation)

- [ ] Should OPAC be public (no login required) or MyJKKN-authenticated only?
- [ ] Barcode system: institution already using barcode scanners, or is this greenfield?
- [ ] MARC import: does institution want to import existing records from NGL via MARC XML / ISO 2709?
- [ ] RFID: should the system support RFID tag IDs in addition to barcodes?
- [ ] Holiday calendar: should it link to `coe-calendar` or be a separate `lib_holidays` table?
- [ ] Multi-branch: does any JKKN institution have multiple campus branches sharing one LMS?
- [ ] INFLIBNET N-LIST: should system auto-fetch subscription data via INFLIBNET API, or manual entry?
- [ ] Learner fines: should unpaid charges block exam registration (integration with COE `exam_registrations`)?
- [ ] Annual stock verification: should system support `stock_verification_list` (NGL equivalent) for annual audit?
- [ ] SMS / email notifications: use existing SMTP config from COE or separate notification gateway?

---

*Spec version: 1.0 | Created: 2026-03-03 | Source: NewGenLib v3.1.5 domain analysis | Author: Claude (JKKN COE Project)*
