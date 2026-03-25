-- =====================================================
-- Migration: Add Revaluation Registration Periods and Payment Fields
-- Created: 2026-02-14
-- Description:
--   1. Create revaluation_registration_periods table
--   2. Add payment tracking fields to revaluation_registrations
-- =====================================================

-- =====================================================
-- 1. Create revaluation_registration_periods table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.revaluation_registration_periods (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

	-- Institution reference
	institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
	institution_code VARCHAR(50) NOT NULL,

	-- Examination session reference
	examination_session_id UUID NOT NULL REFERENCES public.examination_sessions(id) ON DELETE CASCADE,
	session_code VARCHAR(50) NOT NULL,
	session_name VARCHAR(255),

	-- Registration period dates
	start_date TIMESTAMP WITH TIME ZONE NOT NULL,
	end_date TIMESTAMP WITH TIME ZONE NOT NULL,

	-- Configuration
	instructions TEXT,
	is_active BOOLEAN DEFAULT true,
	max_courses_per_application INTEGER DEFAULT 10,

	-- Metadata
	created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
	created_by UUID REFERENCES public.users(id),
	updated_by UUID REFERENCES public.users(id),

	-- Constraints
	CONSTRAINT valid_dates CHECK (end_date > start_date),
	CONSTRAINT unique_session_period UNIQUE (institutions_id, examination_session_id)
);

-- Add comment
COMMENT ON TABLE public.revaluation_registration_periods IS 'Manages revaluation application registration periods with start and end dates';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_revaluation_periods_institution
	ON public.revaluation_registration_periods(institutions_id);

CREATE INDEX IF NOT EXISTS idx_revaluation_periods_session
	ON public.revaluation_registration_periods(examination_session_id);

CREATE INDEX IF NOT EXISTS idx_revaluation_periods_active
	ON public.revaluation_registration_periods(is_active)
	WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_revaluation_periods_dates
	ON public.revaluation_registration_periods(start_date, end_date);


-- =====================================================
-- 2. Add payment fields to revaluation_registrations
-- =====================================================

-- Add payment status (if not exists)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'payment_status'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN payment_status VARCHAR(50) DEFAULT 'Payment Pending';
	END IF;
END $$;

-- Add payment method
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'payment_method'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN payment_method VARCHAR(50);
	END IF;
END $$;

-- Add payment reference
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'payment_reference'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN payment_reference VARCHAR(255);
	END IF;
END $$;

-- Add payment date
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'payment_date'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN payment_date DATE;
	END IF;
END $$;

-- Add verified_by (user who verified payment)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'verified_by'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN verified_by UUID REFERENCES public.users(id);
	END IF;
END $$;

-- Add verified_at (timestamp when payment was verified)
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND column_name = 'verified_at'
	) THEN
		ALTER TABLE public.revaluation_registrations
		ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE;
	END IF;
END $$;

-- Update status enum to include Payment Verified and Payment Failed
DO $$
BEGIN
	-- Drop existing constraint if exists
	IF EXISTS (
		SELECT 1 FROM information_schema.table_constraints
		WHERE table_schema = 'public'
		AND table_name = 'revaluation_registrations'
		AND constraint_name = 'revaluation_registrations_status_check'
	) THEN
		ALTER TABLE public.revaluation_registrations
		DROP CONSTRAINT revaluation_registrations_status_check;
	END IF;

	-- Add new constraint with payment statuses
	ALTER TABLE public.revaluation_registrations
	ADD CONSTRAINT revaluation_registrations_status_check
	CHECK (status IN (
		'Draft',
		'Payment Pending',
		'Payment Verified',
		'Payment Failed',
		'Applied',
		'Under Review',
		'Assigned',
		'Marks Entered',
		'Published',
		'Rejected',
		'Cancelled'
	));
END $$;

-- Add payment status index for filtering
CREATE INDEX IF NOT EXISTS idx_revaluation_registrations_payment_status
	ON public.revaluation_registrations(payment_status)
	WHERE payment_status IN ('Payment Pending', 'Payment Verified', 'Payment Failed');

-- Add comments
COMMENT ON COLUMN public.revaluation_registrations.payment_status IS 'Payment status: Payment Pending, Payment Verified, Payment Failed';
COMMENT ON COLUMN public.revaluation_registrations.payment_method IS 'Payment method: Cash, UPI, Card, Net Banking, Cheque, DD';
COMMENT ON COLUMN public.revaluation_registrations.payment_reference IS 'Payment reference number or transaction ID';
COMMENT ON COLUMN public.revaluation_registrations.payment_date IS 'Date when payment was made';
COMMENT ON COLUMN public.revaluation_registrations.verified_by IS 'User who verified the payment';
COMMENT ON COLUMN public.revaluation_registrations.verified_at IS 'Timestamp when payment was verified';

-- =====================================================
-- 3. Create trigger for updated_at on registration_periods
-- =====================================================

CREATE OR REPLACE FUNCTION update_revaluation_periods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
	NEW.updated_at = CURRENT_TIMESTAMP;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_revaluation_periods_updated_at
	ON public.revaluation_registration_periods;

CREATE TRIGGER trigger_update_revaluation_periods_updated_at
	BEFORE UPDATE ON public.revaluation_registration_periods
	FOR EACH ROW
	EXECUTE FUNCTION update_revaluation_periods_updated_at();

-- =====================================================
-- Migration Complete
-- =====================================================

-- Summary:
-- ✅ Created revaluation_registration_periods table
-- ✅ Added payment tracking fields to revaluation_registrations
-- ✅ Added payment status to status enum
-- ✅ Created optimized indexes
-- ✅ Added updated_at trigger for registration_periods
