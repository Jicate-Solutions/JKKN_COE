-- QP examiner portal: a seventh CoE-editable document, `question_note`.
--
-- The short numbered note pinned above the questions while the setter types
-- them (Bloom's 45/40/15 split, either-or pairs at one level, unit coverage,
-- K5/K6). Until this runs the portal still shows the built-in wording from
-- QP_CONTENT_DEFAULTS; only SAVING a CoE override from
-- QP Examiner Assignment → Content → "Note above Questions" needs the new
-- doc_type to pass the CHECK constraint.
--
-- Run manually in the Supabase SQL Editor.

ALTER TABLE public.ia_qp_portal_content
	DROP CONSTRAINT IF EXISTS ia_qp_portal_content_doc_type_check;

ALTER TABLE public.ia_qp_portal_content
	ADD CONSTRAINT ia_qp_portal_content_doc_type_check
	CHECK (doc_type IN ('instructions', 'checklist', 'declaration', 'claim', 'order', 'guidelines', 'question_note'));
