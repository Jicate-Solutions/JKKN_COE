-- Per-part "Split questions" switch on paper templates.
-- When off, the paper editors hide "Split into (i)/(ii)" for questions in
-- that part, so a template can fix Part A as single-answer slots while
-- Part B/C may still be sub-divided by the setter.
ALTER TABLE public.ia_template_parts
	ADD COLUMN IF NOT EXISTS allow_split BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ia_template_parts.allow_split IS
'May a question in this part be split into sub-divisions (i / ii / iii)? Default true.';
