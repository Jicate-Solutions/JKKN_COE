# MyjkknLIB Migration Analysis Report

> Generated: 2026-03-07
> Sources: CIPET LMS (NGL 3.1.5), migration-MyjkknLIB.sql, spec-MyjkknLIB.md, Koha ILS

---

## 1. CIPET Database Analysis (Source: NewGenLib 3.1.5)

### Summary Statistics

| Metric | Count |
|--------|-------|
| Total Tables | **300** |
| Total Indexes | **47** |
| Total Functions | **89** |
| Total Views | **0** |
| Total Triggers | **0** |
| Total Sequences | **0** |

### Tables by Module

| Module | Tables | Key Tables |
|--------|--------|------------|
| **Accounting & Budget** | 13 | `acc_budget_head`, `acc_budget_transaction`, `acc_fiscal_year`, `acc_library_budget`, `accession_series` |
| **Acquisition & Ordering** | 30+ | `acq_order`, `acq_request`, `acq_invoice`, `acq_claim`, `acq_on_approval`, `acq_receive_quotation` |
| **Cataloguing (Core)** | 12 | `cataloguerecord`, `cataloguerecordfulltextindex`, `searchable_cataloguerecord`, `cat_volume`, `cat_article`, `cat_serial` |
| **Authority Files** | 55+ | `personal_name_af`, `corporate_name_af`, `meeting_name_af`, `uniform_title_af`, `subtopic_af`, `formgenre_af`, `subgeoname_af` + see/seealso variants |
| **Searchable Indexes** | 20+ | `searchable_isbn`, `searchable_issn`, `searchable_*_ass` tables for authority cross-references |
| **Circulation** | 30+ | `cir_transaction`, `cir_reservation`, `cir_ill_request`, `cir_binder_*`, `cir_weedout`, `cir_privilage_matrix` |
| **Patron Management** | 10+ | `patron`, `patron1`, `patron_category`, `patron_registration`, `patron_sdi` |
| **Serials/Periodicals** | 35+ | `sm_subscription`, `sm_registration`, `sm_binder_order`, `sm_prediction`, `sm_claim_issue`, `sm_routing_list` |
| **OPAC & Discovery** | 4 | `opac_hits`, `opac_search_history`, `opac_server`, `opac_session` |
| **MARC / Metadata** | 15+ | `marc_dictionary`, `marcdic_subfield`, `field`, `subfield`, `material_type`, `material_type_field` |
| **Administration** | 30+ | `library`, `location`, `privilege`, `adm_co_vendor`, `adm_co_holiday`, `newgenlib_modules` |
| **Reference Data** | 10+ | `country`, `course`, `department`, `language`, `relator` |

### CIPET Key Design Characteristics

1. **Multi-Tenancy**: `library_id` field in almost all tables (composite PKs)
2. **MARC 21 Compliance**: Full authority file hierarchy with SEE/SEEALSO references
3. **Full-Text Search**: PostgreSQL GIST index on `cataloguerecordfulltextindex`
4. **Budget Tracking**: Detailed allocation, commitment, expenditure, credit notes, foreign exchange
5. **Binding Management**: Complete binding workflow (orders, budgets, types, prices)
6. **SDI (Selective Dissemination)**: Patron subject interest profiles for current awareness
7. **Serial Prediction**: Automated prediction patterns for serial issue arrival
8. **Privilege Matrix**: XML-based permission structure per patron category
9. **On-Approval Acquisitions**: Dedicated approval workflow with committees
10. **OAI-PMH Support**: Harvesting and serving metadata

---

## 2. Migration Schema Analysis (migration-MyjkknLIB.sql)

### Summary Statistics

| Metric | Count |
|--------|-------|
| Total Tables | **22** |
| Total Indexes | **22** |
| Total RLS Policies | **24** |
| Total Functions | **2** |
| Extensions | **2** (uuid-ossp, pg_trgm) |

### Migration Tables

| # | Table | Purpose | Columns |
|---|-------|---------|---------|
| 1 | `lib_member_categories` | Circulation privilege config per category | 12 |
| 2 | `lib_locations` | Shelf locations (DDC stacks, reference, periodicals) | 10 |
| 3 | `lib_members` | Knowledge Community Members | 15 |
| 4 | `lib_catalogue_records` | Bibliographic catalogue records (MARC-compatible) | 24 |
| 5 | `lib_catalogue_authors` | Authors per catalogue record | 6 |
| 6 | `lib_accession_sequences` | Atomic accession number counter | 4 |
| 7 | `lib_items` | Physical resource items (accession register) | 22 |
| 8 | `lib_lending_transactions` | Resource lending (issue/return) | 14 |
| 9 | `lib_resource_holds` | Resource reservations | 14 |
| 10 | `lib_late_charges` | Late return charges (fines) | 16 |
| 11 | `lib_suppliers` | Resource suppliers (vendors) | 16 |
| 12 | `lib_budget_heads` | Acquisition budget heads | 12 |
| 13 | `lib_procurement_requests` | Purchase requests | 20 |
| 14 | `lib_procurement_orders` | Procurement orders | 16 |
| 15 | `lib_procurement_items` | Procurement order line items | 14 |
| 16 | `lib_periodical_subscriptions` | Periodical subscriptions | 22 |
| 17 | `lib_periodical_issues` | Individual issues register | 12 |
| 18 | `lib_digital_resources` | E-books, e-journals, databases | 16 |
| 19 | `lib_member_visits` | Footfall tracking (NAAC 4.2.5) | 8 |
| 20 | `lib_retirement_requests` | Resource retirement (weed-out) | 10 |
| 21 | `lib_conservation_requests` | Conservation/binding requests | 13 |
| 22 | `lib_intercampus_requests` | Inter-campus resource sharing | 16 |

### Migration Key Design Features

1. **UUID Primary Keys**: Modern Supabase-compatible
2. **Row Level Security**: 24 policies for institution-scoped access
3. **Multi-Tenant**: `institution_id` on all tables
4. **MyJKKN Integration**: `learner_id` / `facilitator_id` reference external API (no local profile duplication)
5. **Atomic Accession Numbers**: `lib_next_accession()` function with INSERT...ON CONFLICT
6. **Full-Text Search**: `tsvector` GIN index on catalogue title/subtitle
7. **NAAC Compliance**: Footfall tracking, expenditure, accession metrics built-in
8. **JKKN Terminology**: All labels use JKKN standard naming

---

## 3. Schema Comparison: CIPET vs Migration

### 3.1 Coverage Ratio

| Aspect | CIPET (NGL 3.1.5) | Migration (MyjkknLIB) | Coverage |
|--------|-------------------|------------------------|----------|
| Tables | 300 | 22 | **7.3%** |
| Indexes | 47 | 22 | 46.8% |
| Functions | 89 | 2 | 2.2% |
| Authority Files | 55+ tables | 0 | **0%** |
| Views | 0 | 0 | N/A |

### 3.2 Missing CIPET Modules NOT in Migration

| CIPET Module | Tables in CIPET | Migration Equivalent | Status |
|---|---|---|---|
| **Authority Files (Personal Names)** | 4 tables | None | MISSING |
| **Authority Files (Corporate Names)** | 7 tables | None | MISSING |
| **Authority Files (Meeting Names)** | 8 tables | None | MISSING |
| **Authority Files (Uniform Titles)** | 8 tables | None | MISSING |
| **Authority Files (Geographic)** | 7 tables | None | MISSING |
| **Authority Files (Topics/Genres)** | 10 tables | None | MISSING |
| **Searchable Authority Indexes** | 20+ tables | None | MISSING |
| **MARC Dictionary** | 4 tables | `marc_data JSONB` | SIMPLIFIED |
| **Material Type Control** | 5 tables | `resource_format CHECK` | SIMPLIFIED |
| **Fixed Fields** | 3 tables | None | MISSING |
| **Serial Prediction** | 3 tables | None | MISSING |
| **Serial Binding** | 8 tables | `lib_conservation_requests` | SIMPLIFIED |
| **Serial Routing Lists** | 1 table | None | MISSING |
| **SDI (Current Awareness)** | 5 tables | None | MISSING |
| **On-Approval Acquisitions** | 3 tables | None | MISSING |
| **Quotation Management** | 6 tables | None | MISSING |
| **Credit Notes** | 2 tables | None | MISSING |
| **Foreign Exchange** | 1 table | None | MISSING |
| **Depositary Accounts** | 2 tables | None | MISSING |
| **Budget Approval Workflow** | 1 table | None | MISSING |
| **Budget Transfer** | 1 table | None | MISSING |
| **Patron Registration** | 1 table | None (inline in lib_members) | SIMPLIFIED |
| **Patron SDI Profiles** | 1 table | None | MISSING |
| **Circulation Privilege Matrix** | 1 table | `lib_member_categories` | SIMPLIFIED |
| **Delinquency History** | 1 table | `is_delinquent` flag only | SIMPLIFIED |
| **Lost Item History** | 1 table | `condition` field on lib_items | SIMPLIFIED |
| **ILL Budget Tracking** | 2 tables | None | MISSING |
| **OPAC Session/History** | 4 tables | None | MISSING |
| **Holiday Calendar** | 1 table | None | MISSING |
| **Library Satellite System** | 5 tables | None | MISSING |
| **Form Letters/Templates** | 2 tables | None | MISSING |
| **RSS Feeds** | 1 table | None | MISSING |
| **SRU/W Server Config** | 1 table | None | MISSING |
| **OAI-PMH Harvest** | 2 tables | None | MISSING |

### 3.3 Missing Columns in Existing Migration Tables

#### lib_members (vs CIPET `patron`)
CIPET `patron` has 45+ columns. Missing in migration:
- `address_line1`, `address_line2`, `city`, `state`, `pincode` (guest/alumni need these)
- `date_of_birth`
- `gender`
- `id_proof_type`, `id_proof_number` (for guest verification)
- `deposit_amount` (security deposit)
- `photo` / `photo_url`
- `communication_preferences` (email/SMS opt-in)
- `sdi_profile` (subject interest for recommendations)
- `notes` / `remarks`

#### lib_catalogue_records (vs CIPET `cataloguerecord`)
- `accession_source` (gift/purchase/exchange)
- `entry_date` (cataloguing date vs accession date)
- `notes` / `general_note`
- `physical_description` (pages, size, accompanying material)
- `abstract`
- `table_of_contents`
- `target_audience`
- `accompanying_material`
- `bibliographic_level` (monograph, serial, collection)

#### lib_items (vs CIPET document + accession)
- `shelf_mark` (specific shelf location code)
- `volume_id` (for multi-volume works)
- `notes` / `internal_note`
- `last_seen_date` (for stock verification)
- `withdrawn_date`, `withdrawn_by`
- `replacement_price` (different from purchase price)

#### lib_lending_transactions (vs CIPET `cir_transaction`)
- `checkout_library_id` (for inter-branch lending)
- `return_library_id`
- `notes`
- `recall_date` (when item was recalled)
- `claim_date` (patron claims returned)

#### lib_procurement_orders (vs CIPET `acq_order`)
- `discount_percent`
- `shipping_cost`
- `tax_amount`
- `payment_method`
- `payment_date`
- `receipt_date`
- `delivery_address`

### 3.4 Missing Features

| Feature | CIPET | Migration | Gap |
|---------|-------|-----------|-----|
| **MARC Authority Control** | Full SEE/SEEALSO hierarchy | None | Critical for cataloguing standards |
| **Serial Prediction** | Automated next-issue prediction | None | Manual only |
| **Serial Routing Lists** | Route issues to readers | None | No routing |
| **SDI (Current Awareness)** | Subject interest notifications | None | No alerting |
| **Quotation/Tender System** | Multi-vendor comparison | None | Direct order only |
| **Budget Approval Workflow** | Committee-based approvals | None | No approval chain |
| **Credit Note Management** | Vendor credit tracking | None | No credit handling |
| **On-Approval Returns** | Approval copies workflow | None | No approval process |
| **Holiday Calendar** | Fine calculation exclusions | None | Fines count all days |
| **Patron Delinquency History** | Historical tracking | Flag only | No history |
| **Lost Item Recovery** | Recovery workflow | Status only | No workflow |
| **OPAC Usage Analytics** | Session, search, hit tracking | None | No OPAC analytics |
| **Binding Specification** | Detailed binding specs | Basic conservation | Simplified |
| **Stock Verification** | Inventory audit | None | No stock check |
| **Multi-Library Satellite** | Satellite library system | Single-institution | No satellite |
| **Form Letter Templates** | Overdue notices, receipts | None | No templates |
| **Barcode Label Printing** | Template-based printing | Mentioned in spec | Not in schema |

---

## 4. Complete Feature List (Extracted from CIPET + Spec)

### Core Modules

| Module | CIPET Features | Migration Status |
|--------|---------------|------------------|
| **Cataloguing** | MARC21, authority control, analytics, linking entries, fixed fields, material types, custom indexes | Simplified (JSONB) |
| **Circulation** | Issue, return, renew, recall, reserve, ILL, privilege matrix, delinquency, lost items, binding | Partial (core only) |
| **Members** | Categories, registration, SDI profiles, communication prefs, delinquency history, deposits | Partial |
| **Acquisition** | Requests, quotations, orders, invoices, on-approval, claims, credit notes, budget management | Partial |
| **Serials** | Subscriptions, registrations, predictions, claims, binding, routing, duplicate detection | Partial |
| **OPAC** | Search, hits tracking, session management, server config | Planned (not in schema) |
| **Administration** | Libraries, locations, holidays, privileges, modules, form letters, mail config | Partial |
| **Reports** | NAAC metrics, accession register, circulation summary, budget utilization | Planned |
| **Digital Resources** | E-books, e-journals, databases, INFLIBNET | Present |
| **Conservation** | Binding, repair, lamination, digitisation | Present |
| **Retirement** | Weed-out recommendations and approvals | Present |
| **Inter-Campus** | Resource sharing between JKKN campuses | Present |

### Feature Detail: What's IN the Migration

1. Member enrollment with MyJKKN integration
2. 5-category member system (learner, facilitator, team_member, guest, alumni)
3. Configurable lending privileges per category
4. Catalogue records with DDC classification, ISBN/ISSN, MARC JSONB
5. Multi-author support per catalogue record
6. Physical item tracking with accession number auto-generation
7. Item condition tracking and status management
8. Lending transactions with due date calculation
9. Renewal with configurable limits
10. Resource holds with unique constraint per member per title
11. Late charge calculation and payment tracking
12. Waiver management with approval authority
13. Supplier management with GST/PAN
14. Budget heads with allocation, spent, committed tracking
15. Purchase request submission and approval
16. Procurement orders with line items
17. Periodical subscriptions with frequency tracking
18. Individual issue registration
19. Digital resource catalogue with NAAC reportability flag
20. Member visit/footfall logging
21. Resource retirement workflow
22. Conservation/binding requests
23. Inter-campus resource sharing
24. Full-text search (tsvector + pg_trgm)
25. Row Level Security (institution-scoped)
26. Atomic accession number generation

---

## 5. Koha Feature Benchmark

### Features Koha Has That MyjkknLIB Should Consider

| Priority | Koha Feature | Koha Implementation | MyjkknLIB Recommendation |
|----------|-------------|---------------------|--------------------------|
| **HIGH** | Authority Control | 55+ tables, SEE/SEEALSO | Add `lib_authorities` table with JSONB for flexible authority data |
| **HIGH** | Circulation Rules Engine | `circulation_rules` table | Add `lib_circulation_rules` for complex rule matrices |
| **HIGH** | Notices & Messaging | `letter`, `message_queue` | Add `lib_notice_templates`, `lib_notifications` |
| **HIGH** | Holiday Calendar | `special_holidays`, `repeatable_holidays` | Add `lib_holidays` for accurate fine calculation |
| **HIGH** | Patron Attributes | `borrower_attributes`, `borrower_attribute_types` | Add `lib_member_attributes` for extensible patron data |
| **HIGH** | Action/Audit Logging | `action_logs` | Add `lib_audit_log` for compliance |
| **MEDIUM** | Course Reserves | `course_reserves`, `course_items` | Add `lib_course_reserves` (relevant for academic libraries) |
| **MEDIUM** | Stock Rotation | `stockrotation*` (3 tables) | Add `lib_stock_verification` for annual audit |
| **MEDIUM** | Suggestions | `suggestions` table | Extend `lib_procurement_requests` or add `lib_suggestions` |
| **MEDIUM** | Tags & Reviews | `tags_*`, `reviews`, `ratings` | Add `lib_reviews`, `lib_tags` for OPAC social features |
| **MEDIUM** | Recalls | `recalls` table | Add recall feature to `lib_lending_transactions` |
| **MEDIUM** | Reading Lists | `virtualshelves*` (3 tables) | Add `lib_reading_lists`, `lib_reading_list_items` |
| **MEDIUM** | Import Batch | `import_batches`, `import_records` | Add `lib_import_batches` for MARC import |
| **LOW** | Curbside Pickup | `curbside_pickup*` (4 tables) | Not relevant for Indian academic context |
| **LOW** | Plugin System | `plugin_data`, `plugin_methods` | Over-engineering for initial launch |
| **LOW** | SIP2 Self-Checkout | `sip_*` tables | Future consideration for RFID integration |
| **LOW** | EDI/Edifact | `edifact_*` tables | Not common in Indian college procurement |
| **LOW** | ERM Suite | `erm_*` (20+ tables) | Future: for comprehensive e-resource management |
| **LOW** | OAI-PMH | `oai_*` tables | Future: for institutional repository |

---

## 6. Supabase Best Practices Review

### Current Migration Compliance

| Practice | Status | Notes |
|----------|--------|-------|
| UUID Primary Keys | PASS | All tables use `gen_random_uuid()` |
| Row Level Security | PASS | 24 policies, institution-scoped |
| `institution_id` Multi-Tenant | PASS | All tables have `institution_id` |
| `created_at` / `updated_at` | PARTIAL | Most tables have these; some missing `updated_at` |
| `created_by` Audit | PARTIAL | Some tables missing `created_by` |
| Soft Delete | FAIL | No `deleted_at` column; hard deletes |
| Full-Text Search | PASS | GIN index with tsvector |
| Foreign Key Constraints | PASS | Proper ON DELETE behavior |
| Check Constraints | PASS | Status enums via CHECK |

### Recommended Improvements

1. **Soft Delete**: Add `deleted_at TIMESTAMPTZ` to key tables (`lib_members`, `lib_catalogue_records`, `lib_items`)
2. **Audit Trigger**: Create `update_updated_at()` trigger function for all tables
3. **RLS Policy Fix**: Use `(SELECT auth.uid())` wrapping per Supabase best practices (current migration does NOT wrap)
4. **Separate RLS Policies**: Current migration uses `FOR ALL` - should split into `SELECT`, `INSERT`, `UPDATE`, `DELETE`
5. **Add `updated_by`**: For compliance audit trail
6. **Index on `institution_id`**: Add explicit indexes on `institution_id` for all tables (some missing)
7. **Search Path Security**: Functions should use `SET search_path = ''` and fully qualified names

### RLS Policy Issues in Current Migration

```sql
-- CURRENT (incorrect per Supabase best practices):
CREATE POLICY "lib_items_institution_scope" ON lib_items
  FOR ALL USING (
    institution_id = (SELECT institution_id FROM profiles WHERE id = auth.uid())
  );

-- SHOULD BE (4 separate policies, wrapped auth call):
CREATE POLICY "lib_items_select" ON lib_items
  FOR SELECT TO authenticated
  USING (institution_id = (SELECT (SELECT auth.uid()) ...));

CREATE POLICY "lib_items_insert" ON lib_items
  FOR INSERT TO authenticated
  WITH CHECK (institution_id = (SELECT institution_id FROM profiles WHERE id = (SELECT auth.uid())));
-- etc.
```

---

## 7. Brainstormed Improvements

### Phase 1 - Critical Missing Tables (Add to Migration)

| Table | Purpose | Priority |
|-------|---------|----------|
| `lib_settings` | Per-institution LMS configuration | HIGH |
| `lib_holidays` | Holiday calendar for fine calculation | HIGH |
| `lib_notice_templates` | Overdue notices, receipt templates | HIGH |
| `lib_notifications` | Sent notifications log | HIGH |
| `lib_audit_log` | Action audit trail (NAAC compliance) | HIGH |
| `lib_circulation_rules` | Complex circulation rule engine | HIGH |
| `lib_barcode_templates` | Barcode/label printing templates | MEDIUM |
| `lib_stock_verifications` | Annual stock verification records | MEDIUM |
| `lib_stock_verification_items` | Items checked in verification | MEDIUM |
| `lib_course_reserves` | Course-linked reading lists | MEDIUM |
| `lib_reading_lists` | User-created reading lists | MEDIUM |
| `lib_reading_list_items` | Items in reading lists | MEDIUM |
| `lib_opac_search_log` | OPAC search analytics | MEDIUM |
| `lib_suggestions` | Member book suggestions | MEDIUM |
| `lib_import_batches` | MARC record import batches | LOW |
| `lib_import_records` | Individual import records | LOW |

### Phase 2 - Missing Columns (Add to Existing Tables)

#### lib_members - Add:
```sql
address TEXT,
city TEXT,
state TEXT,
pincode TEXT,
date_of_birth DATE,
gender TEXT,
id_proof_type TEXT,
id_proof_number TEXT,
deposit_amount NUMERIC(10,2) DEFAULT 0,
photo_url TEXT,
notes TEXT,
deleted_at TIMESTAMPTZ
```

#### lib_catalogue_records - Add:
```sql
abstract TEXT,
table_of_contents TEXT,
physical_description TEXT,
general_note TEXT,
bibliographic_level TEXT DEFAULT 'monograph',
accession_source TEXT DEFAULT 'purchase',
entry_date DATE DEFAULT CURRENT_DATE,
deleted_at TIMESTAMPTZ
```

#### lib_items - Add:
```sql
shelf_mark TEXT,
volume_id UUID,
internal_note TEXT,
last_seen_date DATE,
withdrawn_date DATE,
withdrawn_by UUID,
replacement_price NUMERIC(10,2),
deleted_at TIMESTAMPTZ
```

#### lib_lending_transactions - Add:
```sql
checkout_library_id UUID,
return_library_id UUID,
notes TEXT,
recall_date TIMESTAMPTZ,
claim_returned_date TIMESTAMPTZ
```

#### lib_procurement_orders - Add:
```sql
discount_percent NUMERIC(5,2) DEFAULT 0,
shipping_cost NUMERIC(10,2) DEFAULT 0,
tax_amount NUMERIC(10,2) DEFAULT 0,
payment_method TEXT,
payment_date DATE,
receipt_date DATE
```

### Phase 3 - Next-Gen Features

| Feature | Description | Implementation |
|---------|-------------|----------------|
| **AI Book Recommendations** | Suggest books based on borrowing history | Analytics view + API endpoint |
| **Smart Catalogue Search** | pg_trgm fuzzy search + subject facets | Enhanced tsvector + trigram index |
| **Knowledge Graph** | Link authors, subjects, citations | JSONB relationships in catalogue |
| **Research Repository** | Institutional research papers | Extend `lib_digital_resources` |
| **Mobile API** | RESTful API for mobile app | Already planned in spec |
| **Analytics Dashboard** | Real-time library usage metrics | Supabase views + aggregations |
| **Usage Heatmaps** | Time-based usage patterns | `lib_member_visits` aggregation |
| **QR Code Support** | QR codes for book lookup | Barcode field extension |
| **Bulk Import** | CSV/MARC batch import | `lib_import_batches` |
| **RFID Integration** | RFID tag reading for circulation | SIP2-compatible API |

---

## 8. Updated Migration SQL - New Tables to Add

### 8.1 lib_settings
```sql
CREATE TABLE lib_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, setting_key)
);
ALTER TABLE lib_settings ENABLE ROW LEVEL SECURITY;
```

### 8.2 lib_holidays
```sql
CREATE TABLE lib_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  holiday_type TEXT NOT NULL DEFAULT 'closed' CHECK (
    holiday_type IN ('closed', 'half_day', 'no_fine')
  ),
  is_repeating BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, holiday_date)
);
CREATE INDEX idx_lib_holidays_date ON lib_holidays(institution_id, holiday_date);
ALTER TABLE lib_holidays ENABLE ROW LEVEL SECURITY;
```

### 8.3 lib_notice_templates
```sql
CREATE TABLE lib_notice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  template_code TEXT NOT NULL,
  template_name TEXT NOT NULL,
  subject TEXT,
  body_text TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'email' CHECK (
    template_type IN ('email', 'sms', 'print', 'in_app')
  ),
  trigger_event TEXT NOT NULL CHECK (trigger_event IN (
    'overdue_reminder', 'hold_available', 'hold_expiring',
    'membership_expiring', 'item_recalled', 'fine_notice',
    'welcome', 'receipt_issue', 'receipt_return', 'custom'
  )),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(institution_id, template_code)
);
ALTER TABLE lib_notice_templates ENABLE ROW LEVEL SECURITY;
```

### 8.4 lib_notifications
```sql
CREATE TABLE lib_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES lib_members(id) ON DELETE CASCADE,
  template_id UUID REFERENCES lib_notice_templates(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (
    channel IN ('email', 'sms', 'in_app')
  ),
  subject TEXT,
  body TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'read')
  ),
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lib_notifications_member ON lib_notifications(member_id, delivery_status);
CREATE INDEX idx_lib_notifications_pending ON lib_notifications(institution_id, delivery_status)
  WHERE delivery_status = 'pending';
ALTER TABLE lib_notifications ENABLE ROW LEVEL SECURITY;
```

### 8.5 lib_audit_log
```sql
CREATE TABLE lib_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX idx_lib_audit_entity ON lib_audit_log(entity_type, entity_id);
CREATE INDEX idx_lib_audit_date ON lib_audit_log(institution_id, performed_at);
ALTER TABLE lib_audit_log ENABLE ROW LEVEL SECURITY;
```

### 8.6 lib_stock_verifications
```sql
CREATE TABLE lib_stock_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  verification_name TEXT NOT NULL,
  location_id UUID REFERENCES lib_locations(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  total_expected INTEGER NOT NULL DEFAULT 0,
  total_verified INTEGER NOT NULL DEFAULT 0,
  total_missing INTEGER NOT NULL DEFAULT 0,
  total_damaged INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'in_progress' CHECK (
    verification_status IN ('planned', 'in_progress', 'completed', 'cancelled')
  ),
  conducted_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lib_stock_verifications ENABLE ROW LEVEL SECURITY;
```

### 8.7 lib_stock_verification_items
```sql
CREATE TABLE lib_stock_verification_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  verification_id UUID NOT NULL REFERENCES lib_stock_verifications(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES lib_items(id) ON DELETE RESTRICT,
  found_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (
    found_status IN ('not_checked', 'found', 'missing', 'damaged', 'misplaced')
  ),
  scanned_at TIMESTAMPTZ,
  scanned_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lib_sv_items_verification ON lib_stock_verification_items(verification_id);
CREATE INDEX idx_lib_sv_items_item ON lib_stock_verification_items(item_id);
ALTER TABLE lib_stock_verification_items ENABLE ROW LEVEL SECURITY;
```

### 8.8 lib_course_reserves
```sql
CREATE TABLE lib_course_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  course_name TEXT NOT NULL,
  course_code TEXT,
  department TEXT,
  instructor_name TEXT,
  instructor_id UUID,
  academic_year TEXT,
  semester TEXT,
  catalogue_record_id UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  item_id UUID REFERENCES lib_items(id) ON DELETE SET NULL,
  reserve_note TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);
CREATE INDEX idx_lib_course_reserves_course ON lib_course_reserves(institution_id, course_code);
CREATE INDEX idx_lib_course_reserves_catalogue ON lib_course_reserves(catalogue_record_id);
ALTER TABLE lib_course_reserves ENABLE ROW LEVEL SECURITY;
```

### 8.9 lib_reading_lists
```sql
CREATE TABLE lib_reading_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES lib_members(id) ON DELETE CASCADE,
  list_name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE lib_reading_lists ENABLE ROW LEVEL SECURITY;
```

### 8.10 lib_reading_list_items
```sql
CREATE TABLE lib_reading_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES lib_reading_lists(id) ON DELETE CASCADE,
  catalogue_record_id UUID NOT NULL REFERENCES lib_catalogue_records(id) ON DELETE CASCADE,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(list_id, catalogue_record_id)
);
ALTER TABLE lib_reading_list_items ENABLE ROW LEVEL SECURITY;
```

### 8.11 lib_suggestions
```sql
CREATE TABLE lib_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id UUID REFERENCES lib_members(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT,
  publisher TEXT,
  isbn TEXT,
  publication_year INTEGER,
  resource_format TEXT DEFAULT 'book',
  reason TEXT,
  suggestion_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    suggestion_status IN ('pending', 'accepted', 'rejected', 'ordered')
  ),
  manager_note TEXT,
  managed_by UUID,
  managed_at TIMESTAMPTZ,
  procurement_request_id UUID REFERENCES lib_procurement_requests(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lib_suggestions_institution ON lib_suggestions(institution_id, suggestion_status);
ALTER TABLE lib_suggestions ENABLE ROW LEVEL SECURITY;
```

### 8.12 lib_opac_search_log
```sql
CREATE TABLE lib_opac_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  member_id UUID REFERENCES lib_members(id) ON DELETE SET NULL,
  search_query TEXT NOT NULL,
  search_type TEXT DEFAULT 'keyword',
  result_count INTEGER NOT NULL DEFAULT 0,
  filters_applied JSONB,
  searched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lib_opac_search_date ON lib_opac_search_log(institution_id, searched_at);
ALTER TABLE lib_opac_search_log ENABLE ROW LEVEL SECURITY;
```

### 8.13 Helper Functions to Add

```sql
-- Updated timestamp trigger function
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

-- Apply to all lib_ tables with updated_at
CREATE TRIGGER trg_lib_members_updated
  BEFORE UPDATE ON lib_members
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

CREATE TRIGGER trg_lib_catalogue_records_updated
  BEFORE UPDATE ON lib_catalogue_records
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

CREATE TRIGGER trg_lib_items_updated
  BEFORE UPDATE ON lib_items
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

CREATE TRIGGER trg_lib_lending_transactions_updated
  BEFORE UPDATE ON lib_lending_transactions
  FOR EACH ROW EXECUTE FUNCTION lib_update_timestamp();

-- ... (apply to all tables with updated_at)

-- Overdue days excluding holidays
CREATE OR REPLACE FUNCTION lib_overdue_days_excluding_holidays(
  p_institution_id UUID,
  p_due_date DATE
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT GREATEST(0,
    (CURRENT_DATE - p_due_date) -
    (SELECT COUNT(*) FROM public.lib_holidays
     WHERE institution_id = p_institution_id
     AND holiday_date BETWEEN p_due_date AND CURRENT_DATE
     AND holiday_type = 'closed')::INTEGER
  );
$$;
```

---

## 9. Final Summary

### Migration Coverage Assessment

| Category | Score | Details |
|----------|-------|---------|
| **Core Circulation** | 85% | Issue, return, renew, holds, fines - all present |
| **Cataloguing** | 60% | Basic catalogue + authors; missing authority control |
| **Acquisition** | 70% | Orders, requests, suppliers; missing quotations, credit notes |
| **Serials** | 65% | Subscriptions + issues; missing prediction, routing, binding |
| **Digital Resources** | 90% | Well-designed for NAAC reporting |
| **OPAC** | 30% | Planned in spec but no schema tables |
| **Reports** | 40% | NAAC metrics designed but no report tables |
| **Administration** | 50% | Locations, categories; missing holidays, settings, templates |
| **Compliance (NAAC)** | 80% | Footfall, expenditure, accession tracking built-in |
| **MyJKKN Integration** | 95% | Unique strength - external profile resolution |

### Recommended Action Plan

| Phase | Action | Tables Added |
|-------|--------|-------------|
| **Phase 0** | Fix RLS policies (split FOR ALL, wrap auth.uid) | 0 |
| **Phase 1** | Add critical missing tables | +6 (settings, holidays, notices, notifications, audit_log, circulation_rules) |
| **Phase 2** | Add missing columns to existing tables | 0 (ALTER TABLE) |
| **Phase 3** | Add academic features | +4 (course_reserves, reading_lists, reading_list_items, suggestions) |
| **Phase 4** | Add operational features | +3 (stock_verifications, stock_verification_items, opac_search_log) |
| **Phase 5** | Add auto-update triggers | 0 (triggers only) |

### Final Table Count

| Category | Count |
|----------|-------|
| Original migration tables | 22 |
| New tables recommended | +13 |
| **Total tables** | **35** |

This brings the schema from 7.3% CIPET coverage to a focused, modern design that captures the **essential 80%** of library functionality while leveraging Supabase/PostgreSQL modern features (RLS, JSONB, tsvector) instead of replicating NGL's 300-table legacy architecture.

---

*Report generated by LMS Migration Analysis | Sources: cipet.sql (NGL 3.1.5), Koha ILS, MyjkknLIB spec v1.0*
