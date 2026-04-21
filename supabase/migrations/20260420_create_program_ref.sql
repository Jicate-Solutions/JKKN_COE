-- Create program_ref table for institution-specific program short names
-- Used in seating arrangement PDF to display concise program labels

CREATE TABLE IF NOT EXISTS public.program_ref (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID REFERENCES public.institutions(id) ON DELETE CASCADE,
  program_code   TEXT NOT NULL,
  program_name   TEXT NOT NULL,
  short_name     TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, program_code)
);

CREATE INDEX IF NOT EXISTS idx_program_ref_institution_code
  ON public.program_ref (institution_id, program_code);

-- ── Seed data for JKKN CAS ──────────────────────────────────────────────────
-- institution_id: 5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4

INSERT INTO public.program_ref (institution_id, program_code, program_name, short_name) VALUES
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UEN', 'B.A. ENGLISH',                                                        'BA-ENG'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UHI', 'B.A. HISTORY',                                                        'BA-HIS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UMA', 'B.Sc. MATHEMATICS',                                                   'BSC-MATHS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UPH', 'B.Sc. PHYSICS',                                                       'BSC-PHY'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCH', 'B.Sc. CHEMISTRY',                                                     'BSC-CHE'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UZO', 'B.Sc. ZOOLOGY',                                                       'BSC-ZOO'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCS', 'B.Sc. COMPUTER SCIENCE',                                              'BSC-CS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCA', 'BACHELOR OF COMPUTER APPLICATIONS',                                   'BCA'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UAD', 'B.Sc. COMPUTER SCIENCE (ARTIFICIAL INTELLIGENCE & DATA SCIENCE)',    'BSC-CS-AI-DS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCY', 'B.Sc. COMPUTER SCIENCE (CYBER SECURITY)',                            'BSC-CS-CYB'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCM', 'BACHELOR OF COMMERCE',                                               'BCOM'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UCC', 'B.COM. COMPUTER APPLICATION',                                        'BCOM-CA'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UBA', 'BACHELOR OF BUSINESS ADMINISTRATION',                                 'BBA'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UTF', 'B.Sc. TEXTILE AND FASHION DESIGNING',                                'BSC-TFD'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UVC', 'B.Sc. VISUAL COMMUNICATION',                                         'BSC-VISCOM'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UMB', 'B.Sc. MICROBIOLOGY',                                                 'BSC-MICRO'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PEN', 'M.A. ENGLISH',                                                       'MA-ENG'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PHI', 'M.A. HISTORY',                                                       'MA-HIS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PMA', 'M.Sc. MATHEMATICS',                                                  'MSC-MATHS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PCH', 'M.Sc. CHEMISTRY',                                                    'MSC-CHE'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PZO', 'M.Sc. ZOOLOGY',                                                      'MSC-ZOO'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PCA', 'MASTER OF COMPUTER APPLICATIONS',                                    'MCA'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PCS', 'M.Sc. COMPUTER SCIENCE',                                             'MSC-CS'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PDA', 'M.Sc. COMPUTER SCIENCE (DATA ANALYTICS)',                            'MSC-CS-DA'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'PCM', 'MASTER OF COMMERCE',                                                 'MCOM'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UFM', 'B.COM. FINANCIAL MANAGEMENT',                                        'BCOM-FM'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UBI', 'B.COM. BANKING AND INSURANCE',                                       'BCOM-BI'),
  ('5aae1d9d-f4c3-4fa9-8806-d45c71ae35e4', 'UAF', 'B.COM. ACCOUNTANCY AND FINANCE',                                     'BCOM-AF')
ON CONFLICT (institution_id, program_code) DO UPDATE
  SET program_name = EXCLUDED.program_name,
      short_name   = EXCLUDED.short_name,
      updated_at   = NOW();
