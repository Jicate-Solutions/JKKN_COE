-- Common Font for Question Papers
-- Adds a paper-wide default font. When set, every question's text and every
-- MCQ option renders in this font unless a specific question/option overrides
-- it (question text via an inline font-family mark; option via option_font).
-- Both the editor and the PDF renderer honor this column.

alter table ia_question_papers
	add column if not exists default_font text;

comment on column ia_question_papers.default_font is
	'Paper-wide default CSS font-family (e.g. Bamini / Suntommy / Noto Sans Tamil) applied to all question text and options unless a question or option overrides it.';
