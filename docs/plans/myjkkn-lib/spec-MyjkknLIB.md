# MyjkknLIB — Library Management System Spec

> **For Claude:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task.

**Goal:** Build a full-featured, NAAC/NBA-ready Library Management System for JKKN autonomous colleges — modernising NewGenLib v3.1.5 into a Next.js 15 + Supabase web application with JKKN terminology, MyJKKN learner/facilitator/institution integration, and accreditation-grade reporting.

**Architecture:** 5-layer pattern (Types → Services → Hooks → Components → Pages). Multi-tenant via `institution_id` RLS. Member profile data fetched live from MyJKKN API — never stored locally. All physical item copies tracked as `lib_items` linked to `lib_catalogue_records`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), Shadcn UI, Tailwind CSS, MyJKKN API (`https://www.jkkn.ai/api`)

**Source Reference:** NewGenLib (NGL) v3.1.5 — open-source ILS (`InstallNGL3.2/`) used as domain model baseline.

---

## Indian Regulatory Framework

| Body | Role in Library |
|---|---|
| **NAAC Criterion 4.2** | Library as a Learning Resource — tracks books, journals, e-resources, usage, expenditure |
| **NBA SSR Criterion 4** | Technical library collection adequacy per program strength |
| **UGC** | Minimum resource guidelines per learner strength |
| **AICTE** | Mandates volume counts per program for technical colleges |
| **IQAC** | Annual library audit, usage data for NAAC |

### NAAC 4.2 Metrics — What the System Must Auto-Compute

| Metric | System Source |
|---|---|
| 4.2.1 ILS system details | `lib_settings` table |
| 4.2.2 E-resources / databases | `lib_digital_resources` count |
| 4.2.3 Annual expenditure | `lib_procurement_orders` + `lib_periodical_subscriptions` totals |
| 4.2.4 Books added per year | `lib_items.accession_date` filter |
| 4.2.5 Daily average footfall | `lib_member_visits` aggregate |
| 4.2.6 Digital resource count | `lib_digital_resources` count |

### Indian Library Standards

| Standard | Implementation |
|---|---|
| DDC (Dewey Decimal) | `classification_number` on catalogue records |
| MARC 21 | `marc_data JSONB` on catalogue records |
| ISBN / ISSN | Validated fields; ISBN-13 check-digit enforced |
| Accession Register | `lib_items.accession_number` — statutory; auto-generated; never editable |
| Barcode / RFID | `lib_items.barcode` — unique per institution |

---

## JKKN Terminology Standards

| Traditional Term | JKKN Standard | DB / Code |
|---|---|---|
| Library | **Learning Commons** | display label only |
| Librarian | **Knowledge Curator** | role: `knowledge_curator` |
| Library Assistant | **Knowledge Commons Associate** | role: `knowledge_commons_associate` |
| Patron / Member | **Knowledge Community Member** | `lib_members` table |
| Student member | **Learner Member** | `member_category: 'learner'` |
| Faculty member | **Learning Facilitator Member** | `member_category: 'facilitator'` |
| Book | **Learning Resource** | `lib_catalogue_records` |
| Physical copy | **Resource Item** | `lib_items` |
| Catalogue | **Knowledge Registry** | module name |
| Issue / Check-out | **Resource Lending** | `lib_lending_transactions` |
| Return / Check-in | **Resource Return** | `returned_at` on transaction |
| Reservation / Hold | **Resource Hold** | `lib_resource_holds` |
| Fine | **Late Return Charge** | `lib_late_charges` |
| Weed-out | **Resource Retirement** | `lib_retirement_requests` |
| ILL | **Inter-Campus Resource Sharing** | `lib_intercampus_requests` |
| OPAC | **Knowledge Discovery Portal** | module name |
| Subscription | **Periodical Subscription** | `lib_periodical_subscriptions` |
| Vendor | **Resource Supplier** | `lib_suppliers` |
| Purchase Order | **Resource Procurement Order** | `lib_procurement_orders` |
| Reading Room | **Knowledge Hub** | facility label |

---

## MyJKKN API Integration

### Base URL & Auth

```
Base URL : https://www.jkkn.ai/api
Auth     : Bearer ${MYJKKN_API_KEY}   (env: MYJKKN_API_KEY)
Timeout  : 10 000 ms
```

### Endpoints Used by MyjkknLIB

| Purpose | Endpoint | Key Fields |
|---|---|---|
| Institutions list | `GET /api-management/organizations/institutions` | `id`, `institution_name`, `institution_code`, `myjkkn_institution_ids[]` |
| Learner profile | `GET /api-management/learners/profiles/:id` | `id`, `first_name`, `last_name`, `roll_number`, `student_photo_url`, `date_of_birth`, `learner_email`, `program_id`, `department_id`, `institution_id` |
| Learner list | `GET /api-management/learners/profiles?institution_id=&page=&limit=` | paginated, 200 max per page |
| Staff (facilitator) profile | `GET /api-management/staff/:id` | `id`, `first_name`, `last_name`, `staff_photo_url`, `email`, `designation`, `department_id`, `institution_id` |
| Staff list | `GET /api-management/staff?institution_id=&page=&limit=` | paginated |

### Member Profile Resolution Pattern

```
lib_members stores only:  learner_id  (UUID, FK to MyJKKN)
                          facilitator_id (UUID, FK to MyJKKN)

On display:
  if member_category === 'learner'    → fetchMyJKKNLearnerProfileById(learner_id)
  if member_category === 'facilitator' → fetchMyJKKNStaffById(facilitator_id)
  if member_category === 'team_member' → use lib_members.display_name (local)
  if member_category === 'guest'      → use lib_members.display_name (local)
```

### Enrollment for New Members

When registering a new learner member:
1. Search MyJKKN learner list by roll number / name
2. Select learner → store only `learner_id` in `lib_members`
3. Auto-fill display from API: `roll_number`, `full_name`, `photo_url` shown in UI but not persisted

When registering a new facilitator member:
1. Search MyJKKN staff list by name / institution
2. Select staff → store only `facilitator_id`

### Institution Scoping

Each institution in COE has a `myjkkn_institution_ids[]` array.
For learner lookups, pass those IDs to the MyJKKN API (same pattern as COE):

```typescript
// In API route: resolve COE institution → MyJKKN institution IDs
const { data: inst } = await supabase
  .from('institutions')
  .select('myjkkn_institution_ids')
  .eq('id', institutionId)
  .single()

const myjkknIds = inst?.myjkkn_institution_ids || []

// Fetch learners for all MyJKKN institution IDs
for (const myjkknInstId of myjkknIds) {
  const res = await fetchMyJKKNLearnerProfiles({ institution_id: myjkknInstId, page, limit: 200 })
  // ...
}
```

---

## Database Schema

> Migration file: `docs/plans/myjkkn-lib/migration.sql`
> Apply via: Supabase Dashboard → SQL Editor, or `supabase db push`

### `lib_member_categories`

```sql
CREATE TABLE lib_member_categories (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  category_code         TEXT NOT NULL,
  category_name         TEXT NOT NULL,
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

### `lib_locations`

```sql
CREATE TABLE lib_locations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  location_code         TEXT NOT NULL,
  location_name         TEXT NOT NULL,
  floor                 TEXT,
  section               TEXT,
  is_lendable           BOOLEAN DEFAULT true,
  is_active             BOOLEAN DEFAULT true,
  sort_order            INTEGER DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institution_id, location_code)
);
```

### `lib_members`

```sql
CREATE TABLE lib_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  member_number         TEXT NOT NULL,
  member_category       TEXT NOT NULL CHECK (member_category IN (
    'learner', 'facilitator', 'team_member', 'guest', 'alumni'
  )),
  -- MyJKKN references (profile fetched live; never stored locally)
  learner_id            UUID,
  facilitator_id        UUID,
  team_member_id        UUID,
  -- Local fields (guest / alumni only)
  display_name          TEXT,
  email                 TEXT,
  phone                 TEXT,
  -- Membership
  membership_start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  membership_end_date   DATE,
  is_active             BOOLEAN DEFAULT true,
  is_delinquent         BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,
  UNIQUE(institution_id, member_number)
);
```

### `lib_catalogue_records`

```sql
CREATE TABLE lib_catalogue_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  title                 TEXT NOT NULL,
  subtitle              TEXT,
  resource_format       TEXT NOT NULL DEFAULT 'book' CHECK (resource_format IN (
    'book','periodical','thesis','report','map','audio',
    'video','digital','manuscript','standard','patent','other'
  )),
  isbn                  TEXT,
  issn                  TEXT,
  edition               TEXT,
  volume_number         TEXT,
  publication_year      INTEGER,
  language              TEXT DEFAULT 'English',
  classification_number TEXT,
  call_number           TEXT,
  subject_headings      TEXT[],
  publisher_name        TEXT,
  publisher_place       TEXT,
  series_title          TEXT,
  pages                 INTEGER,
  price                 NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',
  marc_data             JSONB,
  default_loan_days     INTEGER,
  is_reference_only     BOOLEAN DEFAULT false,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID
);
CREATE INDEX idx_lib_cat_title_fts ON lib_catalogue_records
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(subtitle,'')));
CREATE INDEX idx_lib_cat_isbn ON lib_catalogue_records(isbn);
CREATE INDEX idx_lib_cat_issn ON lib_catalogue_records(issn);
CREATE INDEX idx_lib_cat_class ON lib_catalogue_records(classification_number);
CREATE INDEX idx_lib_cat_institution ON lib_catalogue_records(institution_id);
```

### `lib_catalogue_authors`

```sql
CREATE TABLE lib_catalogue_authors (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  author_name           TEXT NOT NULL,
  author_type           TEXT DEFAULT 'primary' CHECK (
    author_type IN ('primary','secondary','editor','translator','illustrator')
  ),
  sort_order            INTEGER DEFAULT 0
);
CREATE INDEX idx_lib_authors_record ON lib_catalogue_authors(catalogue_record_id);
```

### `lib_accession_sequences`

Auto-increment counter for accession numbers per institution + type + fiscal year.

```sql
CREATE TABLE lib_accession_sequences (
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  resource_type_code    TEXT NOT NULL,   -- 'BK', 'PER', 'THI', etc.
  fiscal_year           TEXT NOT NULL,   -- '2024-25'
  last_number           BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, resource_type_code, fiscal_year)
);
```

### `lib_items`

```sql
CREATE TABLE lib_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  location_id           UUID REFERENCES lib_locations(id),
  accession_number      TEXT NOT NULL,
  barcode               TEXT,
  copy_number           INTEGER DEFAULT 1,
  condition             TEXT DEFAULT 'good' CHECK (
    condition IN ('new','good','fair','poor','damaged','lost')
  ),
  price                 NUMERIC(10,2),
  invoice_cost          NUMERIC(10,2),
  mrp_value             NUMERIC(10,2),
  discount              NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',
  procurement_item_id   UUID,
  supplier_id           UUID,
  date_received         DATE,
  invoice_number        TEXT,
  status                TEXT NOT NULL DEFAULT 'available' CHECK (status IN (
    'available','on_loan','on_hold','on_order','in_conservation',
    'lost','damaged','retired','missing'
  )),
  is_lendable           BOOLEAN DEFAULT true,
  is_active             BOOLEAN DEFAULT true,
  accession_date        DATE DEFAULT CURRENT_DATE,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,
  UNIQUE(institution_id, accession_number),
  UNIQUE(institution_id, barcode)
);
CREATE INDEX idx_lib_items_catalogue ON lib_items(catalogue_record_id);
CREATE INDEX idx_lib_items_status ON lib_items(institution_id, status);
CREATE INDEX idx_lib_items_barcode ON lib_items(institution_id, barcode);
```

### `lib_lending_transactions`

```sql
CREATE TABLE lib_lending_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  item_id               UUID NOT NULL REFERENCES lib_items(id),
  member_id             UUID NOT NULL REFERENCES lib_members(id),
  issued_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date              DATE NOT NULL,
  issued_by             UUID,
  returned_at           TIMESTAMPTZ,
  returned_by           UUID,
  return_condition      TEXT,
  renewal_count         INTEGER DEFAULT 0,
  last_renewed_at       TIMESTAMPTZ,
  transaction_status    TEXT NOT NULL DEFAULT 'active' CHECK (transaction_status IN (
    'active','returned','overdue','lost_by_member','recalled'
  )),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lib_lending_member ON lib_lending_transactions(member_id, transaction_status);
CREATE INDEX idx_lib_lending_item ON lib_lending_transactions(item_id, transaction_status);
CREATE INDEX idx_lib_lending_due ON lib_lending_transactions(due_date)
  WHERE transaction_status = 'active';
```

### `lib_resource_holds`

```sql
CREATE TABLE lib_resource_holds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  member_id             UUID NOT NULL REFERENCES lib_members(id),
  item_id               UUID REFERENCES lib_items(id),
  hold_placed_at        TIMESTAMPTZ DEFAULT now(),
  hold_expires_at       DATE,
  notified_at           TIMESTAMPTZ,
  checked_out_at        TIMESTAMPTZ,
  hold_status           TEXT NOT NULL DEFAULT 'pending' CHECK (hold_status IN (
    'pending','available','fulfilled','cancelled','expired'
  )),
  cancellation_reason   TEXT,
  placed_by             UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### `lib_late_charges`

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
  payment_status        TEXT NOT NULL DEFAULT 'unpaid' CHECK (
    payment_status IN ('unpaid','paid','waived','partial')
  ),
  payment_date          DATE,
  payment_reference     TEXT,
  collected_by          UUID,
  waiver_reason         TEXT,
  waiver_approved_by    UUID,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lib_charges_member ON lib_late_charges(member_id, payment_status);
```

### `lib_suppliers`

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

### `lib_budget_heads`

```sql
CREATE TABLE lib_budget_heads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  fiscal_year           TEXT NOT NULL,
  budget_head_code      TEXT NOT NULL,
  budget_head_name      TEXT NOT NULL,
  resource_type         TEXT CHECK (resource_type IN (
    'books','periodicals','digital','binding','equipment','other'
  )),
  allocated_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  spent_amount          NUMERIC(14,2) DEFAULT 0,
  committed_amount      NUMERIC(14,2) DEFAULT 0,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institution_id, fiscal_year, budget_head_code)
);
```

### `lib_procurement_requests`

```sql
CREATE TABLE lib_procurement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  request_number        TEXT NOT NULL,
  requested_by          UUID,
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
  purpose               TEXT,
  department            TEXT,
  priority              TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  request_status        TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN (
    'pending','approved','rejected','ordered','received','cancelled'
  )),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  rejection_reason      TEXT,
  catalogue_record_id   UUID REFERENCES lib_catalogue_records(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(institution_id, request_number)
);
```

### `lib_procurement_orders`

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
  order_type            TEXT DEFAULT 'firm' CHECK (
    order_type IN ('firm','on_approval','gift','exchange')
  ),
  total_amount          NUMERIC(14,2),
  currency_code         TEXT DEFAULT 'INR',
  order_status          TEXT NOT NULL DEFAULT 'placed' CHECK (order_status IN (
    'draft','placed','acknowledged','partially_received','received','cancelled','claimed'
  )),
  claim_date            DATE,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  created_by            UUID,
  UNIQUE(institution_id, order_number)
);
```

### `lib_procurement_items`

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
  item_status           TEXT DEFAULT 'pending' CHECK (
    item_status IN ('pending','received','cancelled','claimed')
  ),
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lib_proc_items_order ON lib_procurement_items(order_id);
```

### `lib_periodical_subscriptions`

```sql
CREATE TABLE lib_periodical_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  catalogue_record_id   UUID NOT NULL REFERENCES lib_catalogue_records(id),
  supplier_id           UUID REFERENCES lib_suppliers(id),
  budget_head_id        UUID REFERENCES lib_budget_heads(id),
  subscription_number   TEXT,
  subscription_type     TEXT CHECK (subscription_type IN ('print','online','both')),
  frequency             TEXT CHECK (frequency IN (
    'daily','weekly','fortnightly','monthly','bimonthly',
    'quarterly','half_yearly','annual','irregular'
  )),
  fiscal_year           TEXT NOT NULL,
  start_date            DATE,
  end_date              DATE,
  subscription_cost     NUMERIC(10,2),
  currency_code         TEXT DEFAULT 'INR',
  start_volume          TEXT,
  start_issue           TEXT,
  expected_issues       INTEGER,
  received_issues       INTEGER DEFAULT 0,
  access_url            TEXT,
  login_id              TEXT,
  password_hint         TEXT,
  subscription_status   TEXT DEFAULT 'active' CHECK (subscription_status IN (
    'active','expired','cancelled','gratis','suspended'
  )),
  is_gratis             BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### `lib_periodical_issues`

```sql
CREATE TABLE lib_periodical_issues (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  subscription_id       UUID NOT NULL REFERENCES lib_periodical_subscriptions(id),
  item_id               UUID REFERENCES lib_items(id),
  volume_number         TEXT,
  issue_number          TEXT,
  issue_date            DATE,
  received_date         DATE DEFAULT CURRENT_DATE,
  cover_date            TEXT,
  pages                 INTEGER,
  receipt_status        TEXT DEFAULT 'received' CHECK (receipt_status IN (
    'expected','received','missing','claimed','duplicate'
  )),
  is_bound              BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lib_issues_subscription ON lib_periodical_issues(subscription_id);
```

### `lib_digital_resources`

```sql
CREATE TABLE lib_digital_resources (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  resource_title        TEXT NOT NULL,
  resource_type         TEXT NOT NULL CHECK (resource_type IN (
    'ebook','ejournal','database','open_access','inflibnet',
    'institutional_repository','other'
  )),
  provider              TEXT,
  access_url            TEXT NOT NULL,
  username              TEXT,
  password_hint         TEXT,
  coverage_years        TEXT,
  subject_areas         TEXT[],
  subscription_start    DATE,
  subscription_end      DATE,
  annual_cost           NUMERIC(10,2),
  concurrent_users      INTEGER,
  is_active             BOOLEAN DEFAULT true,
  is_open_access        BOOLEAN DEFAULT false,
  naac_reportable       BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### `lib_member_visits`

```sql
CREATE TABLE lib_member_visits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  member_id             UUID REFERENCES lib_members(id),
  visit_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_time            TIME,
  exit_time             TIME,
  visit_purpose         TEXT CHECK (visit_purpose IN (
    'reading','borrowing','returning','research','opac','digital','other'
  )),
  created_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_lib_visits_date ON lib_member_visits(institution_id, visit_date);
```

### `lib_retirement_requests`

```sql
CREATE TABLE lib_retirement_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  item_id               UUID NOT NULL REFERENCES lib_items(id),
  reason                TEXT NOT NULL,
  condition_at_retirement TEXT,
  recommended_by        UUID,
  approved_by           UUID,
  approval_date         DATE,
  retirement_status     TEXT DEFAULT 'pending' CHECK (retirement_status IN (
    'pending','approved','rejected','completed'
  )),
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### `lib_intercampus_requests`

```sql
CREATE TABLE lib_intercampus_requests (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id              UUID NOT NULL REFERENCES institutions(id),
  providing_institution_id    UUID REFERENCES institutions(id),
  member_id                   UUID NOT NULL REFERENCES lib_members(id),
  catalogue_record_id         UUID REFERENCES lib_catalogue_records(id),
  title                       TEXT NOT NULL,
  author                      TEXT,
  isbn                        TEXT,
  request_date                TIMESTAMPTZ DEFAULT now(),
  due_date                    DATE,
  returned_date               DATE,
  request_status              TEXT DEFAULT 'pending' CHECK (request_status IN (
    'pending','approved','dispatched','received','returned','rejected','lost'
  )),
  item_id                     UUID REFERENCES lib_items(id),
  request_note                TEXT,
  approved_note               TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  updated_at                  TIMESTAMPTZ DEFAULT now()
);
```

### `lib_conservation_requests`

```sql
CREATE TABLE lib_conservation_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id        UUID NOT NULL REFERENCES institutions(id),
  conservation_type     TEXT CHECK (
    conservation_type IN ('binding','repair','lamination','digitisation')
  ),
  item_id               UUID REFERENCES lib_items(id),
  subscription_id       UUID REFERENCES lib_periodical_subscriptions(id),
  sent_to_binder        DATE,
  expected_return       DATE,
  actual_return         DATE,
  binder_name           TEXT,
  binder_invoice        TEXT,
  binding_cost          NUMERIC(10,2),
  conservation_status   TEXT DEFAULT 'identified' CHECK (conservation_status IN (
    'identified','sent','returned','cancelled'
  )),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
```

---

## Module Structure

```
MyjkknLIB/                                   # New Next.js 15 project
│
├── types/
│   └── lib.ts                               # All LMS TypeScript interfaces
│
├── services/library/
│   ├── lib-members-service.ts               # fetch, create, update member
│   ├── lib-catalogue-service.ts             # CRUD + full-text search
│   ├── lib-items-service.ts                 # CRUD + accession generation
│   ├── lib-circulation-service.ts           # issue, return, renew
│   ├── lib-holds-service.ts                 # place, cancel, fulfil holds
│   ├── lib-late-charges-service.ts          # calculate, collect, waive
│   ├── lib-procurement-service.ts           # requests, orders, receive
│   ├── lib-suppliers-service.ts
│   ├── lib-budget-service.ts
│   ├── lib-periodicals-service.ts           # subscriptions + issues
│   ├── lib-digital-service.ts
│   ├── lib-visits-service.ts
│   ├── lib-retirement-service.ts
│   └── lib-reports-service.ts              # NAAC, accession register
│
├── services/myjkkn/
│   └── myjkkn-lib-service.ts               # institution, learner profile, staff fetch
│                                            # (re-uses pattern from myjkkn-service.ts)
│
├── hooks/library/
│   ├── use-lib-members.ts
│   ├── use-lib-catalogue.ts
│   ├── use-lib-items.ts
│   ├── use-lib-circulation.ts
│   ├── use-lib-holds.ts
│   ├── use-lib-late-charges.ts
│   ├── use-lib-procurement.ts
│   ├── use-lib-periodicals.ts
│   ├── use-lib-digital.ts
│   └── use-lib-reports.ts
│
├── components/library/
│   ├── resource-status-badge.tsx            # available/on_loan/retired colour chips
│   ├── member-category-badge.tsx            # learner/facilitator/guest badges
│   ├── member-profile-card.tsx              # fetches photo+name from MyJKKN on render
│   ├── accession-label.tsx                  # printable accession label
│   ├── barcode-scanner-input.tsx            # keyboard-wedge auto-focus input
│   ├── catalogue-search-box.tsx             # full-text search with format filter
│   ├── item-availability-card.tsx           # copies available/total for a title
│   ├── late-charge-preview.tsx              # real-time overdue charge calculator
│   ├── opac-result-card.tsx                 # single OPAC search result
│   ├── naac-metric-card.tsx                 # single NAAC 4.2 metric display
│   └── budget-utilisation-bar.tsx           # allocated vs spent progress bar
│
├── app/(lib)/
│   ├── layout.tsx                           # LMS nav: Registry|Circulation|Acquisition|Periodicals|Digital|Reports
│   ├── page.tsx                             # Learning Commons Dashboard
│   ├── members/page.tsx
│   ├── members/_components/...
│   ├── registry/page.tsx                    # Knowledge Registry (catalogue)
│   ├── registry/_components/...
│   ├── registry/[id]/page.tsx               # Record detail + items
│   ├── circulation/page.tsx                 # Circulation desk (issue/return/renew)
│   ├── circulation/_components/...
│   ├── circulation/holds/page.tsx
│   ├── circulation/overdue/page.tsx
│   ├── circulation/charges/page.tsx
│   ├── acquisition/page.tsx
│   ├── acquisition/requests/page.tsx
│   ├── acquisition/orders/page.tsx
│   ├── acquisition/suppliers/page.tsx
│   ├── acquisition/budget/page.tsx
│   ├── periodicals/page.tsx
│   ├── periodicals/[subscriptionId]/page.tsx
│   ├── digital/page.tsx
│   ├── opac/page.tsx                        # Knowledge Discovery Portal
│   ├── retirement/page.tsx
│   ├── intercampus/page.tsx
│   ├── conservation/page.tsx
│   └── reports/page.tsx                     # NAAC 4.2 + statutory reports
│
└── app/api/lib/
    ├── members/route.ts                     # GET, POST
    ├── members/[id]/route.ts                # GET, PUT, DELETE
    ├── catalogue/route.ts                   # GET, POST
    ├── catalogue/search/route.ts            # full-text OPAC search
    ├── catalogue/[id]/route.ts
    ├── catalogue/[id]/items/route.ts
    ├── items/route.ts
    ├── items/[id]/route.ts
    ├── circulation/issue/route.ts
    ├── circulation/return/route.ts
    ├── circulation/renew/route.ts
    ├── circulation/holds/route.ts
    ├── circulation/holds/[id]/route.ts
    ├── circulation/overdue/route.ts
    ├── charges/route.ts
    ├── charges/[id]/route.ts
    ├── charges/calculate/route.ts
    ├── procurement/requests/route.ts
    ├── procurement/requests/[id]/route.ts
    ├── procurement/orders/route.ts
    ├── procurement/orders/[id]/route.ts
    ├── procurement/orders/[id]/receive/route.ts
    ├── procurement/suppliers/route.ts
    ├── procurement/suppliers/[id]/route.ts
    ├── procurement/budget/route.ts
    ├── procurement/budget/[id]/route.ts
    ├── periodicals/subscriptions/route.ts
    ├── periodicals/subscriptions/[id]/route.ts
    ├── periodicals/subscriptions/[id]/issues/route.ts
    ├── digital/route.ts
    ├── digital/[id]/route.ts
    ├── visits/route.ts
    ├── retirement/route.ts
    ├── intercampus/route.ts
    ├── conservation/route.ts
    └── reports/
        ├── naac/route.ts
        ├── accession-register/route.ts
        ├── circulation-summary/route.ts
        ├── budget-utilisation/route.ts
        └── overdue/route.ts
```

---

## TypeScript Interfaces (`types/lib.ts`)

```typescript
// types/lib.ts

export type LibMemberCategory = 'learner' | 'facilitator' | 'team_member' | 'guest' | 'alumni'
export type LibResourceFormat =
  | 'book' | 'periodical' | 'thesis' | 'report' | 'map'
  | 'audio' | 'video' | 'digital' | 'manuscript' | 'standard' | 'patent' | 'other'
export type LibItemStatus =
  | 'available' | 'on_loan' | 'on_hold' | 'on_order' | 'in_conservation'
  | 'lost' | 'damaged' | 'retired' | 'missing'
export type LibTransactionStatus =
  | 'active' | 'returned' | 'overdue' | 'lost_by_member' | 'recalled'
export type LibChargePaymentStatus = 'unpaid' | 'paid' | 'waived' | 'partial'
export type LibOrderStatus =
  | 'draft' | 'placed' | 'acknowledged' | 'partially_received' | 'received' | 'cancelled' | 'claimed'

// ── MyJKKN integrated types ──────────────────────────────────────────

export interface LibMemberProfile {
  // from MyJKKN learner profile
  id: string
  first_name: string
  last_name: string
  roll_number?: string
  student_photo_url?: string
  date_of_birth?: string
  learner_email?: string
  program_id?: string
  department_id?: string
  institution_id?: string
}

export interface LibStaffProfile {
  // from MyJKKN staff
  id: string
  first_name: string
  last_name: string
  staff_photo_url?: string
  email?: string
  designation?: string
  department_id?: string
  institution_id?: string
}

// ── Core entities ────────────────────────────────────────────────────

export interface LibMemberCategory_ {
  id: string
  institution_id: string
  category_code: string
  category_name: string
  max_items_allowed: number
  loan_period_days: number
  renewal_limit: number
  renewal_period_days: number
  late_charge_per_day: number
  reservation_limit: number
  can_access_digital: boolean
}

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
  // Resolved at display time (not stored)
  resolved_profile?: LibMemberProfile | LibStaffProfile
}

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
  author_name: string
  author_type?: 'primary' | 'secondary' | 'editor' | 'translator' | 'illustrator'
  sort_order: number
}

export interface LibItem {
  id: string
  institution_id: string
  catalogue_record_id: string
  location_id?: string
  accession_number: string
  barcode?: string
  copy_number: number
  condition?: string
  price?: number
  invoice_cost?: number
  status: LibItemStatus
  is_lendable: boolean
  is_active: boolean
  accession_date: string
  created_at: string
  updated_at: string
  catalogue_record?: LibCatalogueRecord
}

export interface LibLendingTransaction {
  id: string
  institution_id: string
  item_id: string
  member_id: string
  issued_at: string
  due_date: string
  issued_by?: string
  returned_at?: string
  renewal_count: number
  transaction_status: LibTransactionStatus
  created_at: string
  updated_at: string
  // Joined / computed
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
  hold_status: 'pending' | 'available' | 'fulfilled' | 'cancelled' | 'expired'
  created_at: string
}

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
  created_at: string
}

export interface LibSupplier {
  id: string
  institution_id: string
  supplier_code: string
  supplier_name: string
  contact_person?: string
  email?: string
  phone?: string
  city?: string
  state?: string
  gst_number?: string
  is_active: boolean
}

export interface LibBudgetHead {
  id: string
  institution_id: string
  fiscal_year: string
  budget_head_code: string
  budget_head_name: string
  resource_type?: string
  allocated_amount: number
  spent_amount: number
  committed_amount: number
  is_active: boolean
  // computed
  available_amount?: number
  utilisation_percent?: number
}

export interface LibProcurementOrder {
  id: string
  institution_id: string
  order_number: string
  supplier_id: string
  fiscal_year?: string
  order_date: string
  order_type: 'firm' | 'on_approval' | 'gift' | 'exchange'
  total_amount?: number
  order_status: LibOrderStatus
  created_at: string
  supplier?: LibSupplier
  items?: LibProcurementItem[]
}

export interface LibProcurementItem {
  id: string
  order_id: string
  title: string
  isbn?: string
  quantity_ordered: number
  quantity_received: number
  unit_price?: number
  total_price?: number
  item_status: 'pending' | 'received' | 'cancelled' | 'claimed'
}

export interface LibPeriodicalSubscription {
  id: string
  institution_id: string
  catalogue_record_id: string
  fiscal_year: string
  subscription_type?: 'print' | 'online' | 'both'
  frequency?: string
  subscription_cost?: number
  expected_issues?: number
  received_issues: number
  subscription_status: 'active' | 'expired' | 'cancelled' | 'gratis' | 'suspended'
  is_gratis: boolean
  catalogue_record?: LibCatalogueRecord
}

export interface LibPeriodicalIssue {
  id: string
  subscription_id: string
  volume_number?: string
  issue_number?: string
  received_date?: string
  receipt_status: 'expected' | 'received' | 'missing' | 'claimed' | 'duplicate'
  is_bound: boolean
}

export interface LibDigitalResource {
  id: string
  institution_id: string
  resource_title: string
  resource_type: string
  provider?: string
  access_url: string
  subject_areas?: string[]
  is_active: boolean
  is_open_access: boolean
  naac_reportable: boolean
}

// ── Reports ───────────────────────────────────────────────────────────

export interface LibNaacReport {
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

export interface LibAccessionEntry {
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
  location_name?: string
}

export interface LibListResponse<T> {
  data: T[]
  metadata: { total: number; page: number; limit: number; total_pages: number }
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/lib/members` | List members (filter: category, active, delinquent, search) |
| POST | `/api/lib/members` | Create member (learner_id / facilitator_id from MyJKKN) |
| GET | `/api/lib/members/:id` | Member detail + active loans + holds + charges |
| PUT | `/api/lib/members/:id` | Update member |
| DELETE | `/api/lib/members/:id` | Deactivate |
| GET | `/api/lib/catalogue` | List catalogue records |
| POST | `/api/lib/catalogue` | Create record |
| GET | `/api/lib/catalogue/search` | Full-text OPAC search |
| GET | `/api/lib/catalogue/:id` | Record + items |
| PUT | `/api/lib/catalogue/:id` | Update record |
| GET | `/api/lib/catalogue/:id/items` | Physical items for record |
| POST | `/api/lib/items` | Add item (auto-generate accession) |
| PUT | `/api/lib/items/:id` | Update item |
| POST | `/api/lib/circulation/issue` | Lend item → create transaction |
| POST | `/api/lib/circulation/return` | Return → compute charges if overdue |
| POST | `/api/lib/circulation/renew` | Renew loan |
| GET | `/api/lib/circulation/holds` | Hold queue |
| POST | `/api/lib/circulation/holds` | Place hold |
| PUT | `/api/lib/circulation/holds/:id` | Update / cancel hold |
| GET | `/api/lib/circulation/overdue` | Overdue list with computed charges |
| GET | `/api/lib/charges` | All late charges |
| PUT | `/api/lib/charges/:id` | Collect payment / waive |
| POST | `/api/lib/charges/calculate` | Preview charge for transaction |
| GET | `/api/lib/procurement/requests` | Purchase request list |
| POST | `/api/lib/procurement/requests` | Create request |
| PUT | `/api/lib/procurement/requests/:id` | Approve / reject |
| GET | `/api/lib/procurement/orders` | Procurement order list |
| POST | `/api/lib/procurement/orders` | Create order |
| POST | `/api/lib/procurement/orders/:id/receive` | Receive items → auto-accession |
| GET | `/api/lib/procurement/suppliers` | Supplier list |
| POST | `/api/lib/procurement/suppliers` | Create supplier |
| GET | `/api/lib/procurement/budget` | Budget heads |
| POST | `/api/lib/procurement/budget` | Create budget head |
| GET | `/api/lib/periodicals/subscriptions` | Subscription list |
| POST | `/api/lib/periodicals/subscriptions` | Create subscription |
| GET | `/api/lib/periodicals/subscriptions/:id/issues` | Issue register |
| POST | `/api/lib/periodicals/subscriptions/:id/issues` | Register received issue |
| GET | `/api/lib/digital` | Digital resources |
| POST | `/api/lib/digital` | Add digital resource |
| POST | `/api/lib/visits` | Log footfall |
| GET | `/api/lib/reports/naac` | NAAC Criterion 4.2 full package |
| GET | `/api/lib/reports/accession-register` | Statutory accession register (Excel) |
| GET | `/api/lib/reports/circulation-summary` | Daily/monthly lending stats |
| GET | `/api/lib/reports/budget-utilisation` | Budget utilisation |
| GET | `/api/lib/reports/overdue` | Overdue analysis |

---

## Accession Number Auto-Generation

Format: `{INST_CODE}/{TYPE_CODE}/{FY}/{PADDED_SEQUENCE}`

Examples:
- `JKKN/BK/2024-25/00001` — first book in JKKN, FY 2024-25
- `ARTS/PER/2024-25/00045` — 45th periodical in Arts college
- `JKKN/THI/2024-25/00003` — 3rd thesis

Type codes: `BK` (book), `PER` (periodical), `THI` (thesis), `REP` (report), `DIG` (digital), `OTH` (other)

Generation uses atomic `UPDATE ... RETURNING` on `lib_accession_sequences`:
```sql
UPDATE lib_accession_sequences
SET last_number = last_number + 1
WHERE institution_id = $1 AND resource_type_code = $2 AND fiscal_year = $3
RETURNING last_number;
```

---

## Validation Rules

| Rule | Details |
|---|---|
| Accession number unique | Cannot edit after creation — statutory record |
| Delinquent block | `is_delinquent = true` → block new lending until charges cleared |
| Lending limit | Count active transactions per member vs `max_items_allowed` |
| Renewal limit | `renewal_count < renewal_limit` required |
| No self-hold duplicate | Member cannot hold same catalogue record twice |
| Item must be available | `status = 'available'` required before lending |
| Due date calculation | `CURRENT_DATE + loan_period_days` (from member category) |
| Return charge trigger | `returned_at.date > due_date` → auto-create `lib_late_charges` |
| Retirement approval | `approved_by` required before status → 'completed' |
| Waiver authority | `waiver_amount > 0` requires `waiver_approved_by` |
| ISBN-13 check digit | Enforce on create/update |
| ISSN format | Regex: `\d{4}-\d{3}[\dX]` |
| Budget overrun | Warning (not block) when procurement exceeds `available_amount` |

---

## RLS Policies

```sql
-- Pattern repeated for all lib_ tables:
ALTER TABLE lib_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lib_members_institution_scope" ON lib_members
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

-- Learner: read own record only
CREATE POLICY "lib_members_learner_own" ON lib_members
  FOR SELECT USING (
    learner_id = auth.uid()
  );
```

Roles:
| Role | Access |
|---|---|
| `knowledge_curator` | Full access all lib_ tables |
| `knowledge_commons_associate` | Circulation tables only (lending, returns, holds, charges) |
| `learning_facilitator` | OPAC read + own transactions + submit procurement requests |
| `learner` | OPAC read + own transactions (via portal) |
| `super_admin` | All institutions |

---

## Implementation Phases

| Phase | Scope |
|---|---|
| **1 — Foundation** | Supabase tables + RLS + seed data. `lib_members` CRUD. MyJKKN learner/staff member enrollment. |
| **2 — Knowledge Registry** | `lib_catalogue_records` + `lib_catalogue_authors` CRUD. `lib_items` with accession auto-generation. Accession label print. |
| **3 — Circulation** | Circulation desk (barcode issue/return/renew). Hold queue. Overdue list. Late charge computation + payment. |
| **4 — Procurement** | Supplier + budget head management. Purchase request approval workflow. Procurement order → receive → auto-accession. |
| **5 — Periodicals & Digital** | Subscription management. Issue receipt log. Missing issue claims. Digital resources catalogue. |
| **6 — OPAC** | Full-text search (`tsvector`). Faceted filters. Learner self-service portal (My Loans / My Holds / My Charges). |
| **7 — Reports** | NAAC 4.2 dashboard. Statutory accession register (Excel). Circulation, budget, overdue, footfall reports. |

---

## Open Questions

- [ ] Is the OPAC public (no login) or requires MyJKKN login?
- [ ] Does any institution have multi-branch / multiple campuses sharing one LMS?
- [ ] Barcode system: existing hardware available or greenfield?
- [ ] MARC import: need to migrate existing NGL records via MARC XML?
- [ ] RFID support required alongside barcodes?
- [ ] Should unpaid late charges block exam registration? (COE integration)
- [ ] Annual stock verification module needed?
- [ ] Notification channel: existing COE SMTP config or separate gateway?
- [ ] INFLIBNET N-LIST: manual entry or API integration?

---

*Spec version: 1.0 | Created: 2026-03-03 | Source: NGL v3.1.5 + MyJKKN API analysis*
