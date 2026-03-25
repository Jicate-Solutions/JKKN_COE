import { NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase-server'

// This is a one-time admin endpoint to apply the trigger fix
// DELETE THIS FILE after successfully applying the fix

export async function POST() {
	try {
		const supabase = getSupabaseServer()

		// The SQL to create the updated trigger function
		// Pass marks are ALWAYS read from the COURSES table for each course
		// No hardcoded defaults - all values come from courses table
		const triggerSQL = `
CREATE OR REPLACE FUNCTION auto_determine_pass_status()
RETURNS TRIGGER AS $$
DECLARE
    v_internal_pass_mark NUMERIC;
    v_external_pass_mark NUMERIC;
    v_total_pass_mark NUMERIC;
    v_internal_max_mark NUMERIC;
    v_external_max_mark NUMERIC;
    v_total_max_mark NUMERIC;
    v_internal_pct DECIMAL(5,2);
    v_external_pct DECIMAL(5,2);
    v_total_pct DECIMAL(5,2);
    v_internal_pass_pct DECIMAL(5,2);
    v_external_pass_pct DECIMAL(5,2);
    v_total_pass_pct DECIMAL(5,2);
    v_passes_internal BOOLEAN;
    v_passes_external BOOLEAN;
    v_passes_total BOOLEAN;
BEGIN
    -- Fetch pass criteria from COURSES table
    -- Each course has its own pass mark requirements
    SELECT
        c.internal_pass_mark,
        c.external_pass_mark,
        c.total_pass_mark,
        c.internal_max_mark,
        c.external_max_mark,
        c.total_max_mark
    INTO
        v_internal_pass_mark,
        v_external_pass_mark,
        v_total_pass_mark,
        v_internal_max_mark,
        v_external_max_mark,
        v_total_max_mark
    FROM public.course_offerings co
    INNER JOIN public.courses c ON co.course_id = c.id
    WHERE co.id = NEW.course_offering_id;

    -- Default max marks from NEW record if not found
    v_internal_max_mark := COALESCE(v_internal_max_mark, NEW.internal_marks_maximum);
    v_external_max_mark := COALESCE(v_external_max_mark, NEW.external_marks_maximum);
    v_total_max_mark := COALESCE(v_total_max_mark, NEW.total_marks_maximum);

    -- Pass marks default to 0 (no minimum required if not set)
    v_internal_pass_mark := COALESCE(v_internal_pass_mark, 0);
    v_external_pass_mark := COALESCE(v_external_pass_mark, 0);
    v_total_pass_mark := COALESCE(v_total_pass_mark, 0);

    -- Calculate OBTAINED percentages
    IF NEW.internal_marks_maximum > 0 THEN
        v_internal_pct := ROUND((NEW.internal_marks_obtained / NEW.internal_marks_maximum) * 100, 2);
    ELSE
        v_internal_pct := 0;
    END IF;

    IF NEW.external_marks_maximum > 0 THEN
        v_external_pct := ROUND((NEW.external_marks_obtained / NEW.external_marks_maximum) * 100, 2);
    ELSE
        v_external_pct := 0;
    END IF;

    IF NEW.total_marks_maximum > 0 THEN
        v_total_pct := ROUND((NEW.total_marks_obtained / NEW.total_marks_maximum) * 100, 2);
    ELSE
        v_total_pct := 0;
    END IF;

    -- Calculate PASS PERCENTAGE thresholds from course pass marks
    -- If pass_mark < max_mark, it's absolute - convert to percentage
    -- If pass_mark >= max_mark, it's already a percentage
    -- If pass_mark = 0, no minimum required

    IF v_internal_max_mark > 0 AND v_internal_pass_mark > 0 THEN
        IF v_internal_pass_mark < v_internal_max_mark THEN
            v_internal_pass_pct := ROUND((v_internal_pass_mark / v_internal_max_mark) * 100, 2);
        ELSE
            v_internal_pass_pct := v_internal_pass_mark;
        END IF;
    ELSE
        v_internal_pass_pct := 0;
    END IF;

    IF v_external_max_mark > 0 AND v_external_pass_mark > 0 THEN
        IF v_external_pass_mark < v_external_max_mark THEN
            v_external_pass_pct := ROUND((v_external_pass_mark / v_external_max_mark) * 100, 2);
        ELSE
            v_external_pass_pct := v_external_pass_mark;
        END IF;
    ELSE
        v_external_pass_pct := 0;
    END IF;

    IF v_total_max_mark > 0 AND v_total_pass_mark > 0 THEN
        IF v_total_pass_mark < v_total_max_mark THEN
            v_total_pass_pct := ROUND((v_total_pass_mark / v_total_max_mark) * 100, 2);
        ELSE
            v_total_pass_pct := v_total_pass_mark;
        END IF;
    ELSE
        v_total_pass_pct := 0;
    END IF;

    -- Determine pass/fail
    v_passes_internal := (v_internal_pass_pct = 0) OR (v_internal_pct >= v_internal_pass_pct);
    v_passes_external := (v_external_pass_pct = 0) OR (v_external_pct >= v_external_pass_pct);
    v_passes_total := (v_total_pass_pct = 0) OR (v_total_pct >= v_total_pass_pct);

    IF v_passes_internal AND v_passes_external AND v_passes_total THEN
        NEW.is_pass = true;
        NEW.pass_status = 'Pass';
        NEW.is_distinction = v_total_pct >= 75;
        NEW.is_first_class = v_total_pct >= 60;
    ELSE
        NEW.is_pass = false;
        NEW.pass_status = 'Fail';
        NEW.is_distinction = false;
        NEW.is_first_class = false;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`

		// Unfortunately, Supabase JS client doesn't support raw SQL execution
		// You need to run this SQL directly in Supabase Dashboard > SQL Editor
		// Copy the SQL from the migration file and run it there

		// For now, just trigger recalculation by updating records
		const { data, error } = await supabase
			.from('final_marks')
			.update({ updated_at: new Date().toISOString() })
			.eq('is_active', true)
			.select('id')

		if (error) {
			console.error('Error updating records:', error)
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		// Get updated counts
		const { count: totalCount } = await supabase
			.from('final_marks')
			.select('*', { count: 'exact', head: true })
			.eq('is_active', true)

		const { count: passCount } = await supabase
			.from('final_marks')
			.select('*', { count: 'exact', head: true })
			.eq('is_active', true)
			.eq('is_pass', true)

		const { count: failCount } = await supabase
			.from('final_marks')
			.select('*', { count: 'exact', head: true })
			.eq('is_active', true)
			.eq('is_pass', false)

		return NextResponse.json({
			success: true,
			message: 'Records updated. Note: You need to run the trigger SQL in Supabase Dashboard > SQL Editor',
			triggerSQL,
			stats: {
				total: totalCount,
				passed: passCount,
				failed: failCount,
				passRate: totalCount && totalCount > 0 ? ((passCount || 0) / totalCount * 100).toFixed(2) + '%' : '0%'
			}
		})
	} catch (error) {
		console.error('Error:', error)
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		)
	}
}
