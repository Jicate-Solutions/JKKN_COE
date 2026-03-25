-- =====================================================
-- Fix publish_semester_results Function
-- =====================================================
-- Date: 2025-12-04
-- Purpose: When semester results are published, also update
-- final_marks.result_status to 'Published' so that
-- create_backlogs_from_semester_results can find them
-- =====================================================

-- Drop and recreate the function with the fix
CREATE OR REPLACE FUNCTION publish_semester_results(
	p_semester_result_ids UUID[],
	p_published_by UUID DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
	v_published_by UUID;
	v_updated_count INT;
	v_sr RECORD;
BEGIN
	v_published_by := COALESCE(p_published_by, auth.uid());

	-- Update semester_results
	UPDATE public.semester_results
	SET
		is_published = true,
		published_date = CURRENT_DATE,
		published_by = v_published_by,
		is_locked = true,
		locked_by = v_published_by,
		locked_date = CURRENT_DATE,
		updated_at = CURRENT_TIMESTAMP,
		updated_by = v_published_by
	WHERE id = ANY(p_semester_result_ids)
		AND is_published = false
		AND result_declared_date IS NOT NULL;

	GET DIAGNOSTICS v_updated_count = ROW_COUNT;

	-- Also update final_marks.result_status to 'Published' for all related records
	-- This is required for create_backlogs_from_semester_results to work
	FOR v_sr IN
		SELECT
			sr.student_id,
			sr.examination_session_id,
			sr.semester,
			sr.program_id
		FROM public.semester_results sr
		WHERE sr.id = ANY(p_semester_result_ids)
			AND sr.is_published = true
	LOOP
		UPDATE public.final_marks fm
		SET
			result_status = 'Published',
			updated_at = CURRENT_TIMESTAMP,
			updated_by = v_published_by
		FROM public.course_offerings co
		WHERE fm.course_offering_id = co.id
			AND fm.student_id = v_sr.student_id
			AND fm.examination_session_id = v_sr.examination_session_id
			AND fm.program_id = v_sr.program_id
			AND co.semester = v_sr.semester
			AND fm.result_status != 'Published';
	END LOOP;

	RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION publish_semester_results(UUID[], UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION publish_semester_results(UUID[], UUID) TO service_role;

COMMENT ON FUNCTION publish_semester_results(UUID[], UUID) IS 'Publishes semester results, locks them, and updates final_marks.result_status to Published';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
