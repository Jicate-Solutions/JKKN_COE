-- Clear all packet_no values for a specific session before regenerating packets
-- Run this in Supabase SQL Editor BEFORE generating packets

UPDATE student_dummy_numbers
SET packet_no = NULL
WHERE examination_session_id = (
  SELECT id
  FROM examination_sessions
  WHERE session_code = 'JKKNCAS-NOV-DEC-2025'
  LIMIT 1
);

-- Verify the update
SELECT COUNT(*) as cleared_count
FROM student_dummy_numbers
WHERE examination_session_id = (
  SELECT id
  FROM examination_sessions
  WHERE session_code = 'JKKNCAS-NOV-DEC-2025'
  LIMIT 1
)
AND packet_no IS NULL;
