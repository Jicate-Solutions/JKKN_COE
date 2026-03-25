-- Update course_order column from integer to numeric to support decimal values (e.g., 1.1, 1.2)
ALTER TABLE public.course_mapping
ALTER COLUMN course_order TYPE numeric(5,2);

-- Update default value to support decimals
ALTER TABLE public.course_mapping
ALTER COLUMN course_order SET DEFAULT 1.0;

-- Add comment for documentation
COMMENT ON COLUMN public.course_mapping.course_order IS 'Order of the course in the curriculum (supports decimal values like 1.1, 1.2 for fine-grained ordering)';
