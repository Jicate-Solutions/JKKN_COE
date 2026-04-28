-- Change exam_registrations registration_status default from 'Pending' to 'Approved'
ALTER TABLE public.exam_registrations
ALTER COLUMN registration_status SET DEFAULT 'Approved'::character varying;
