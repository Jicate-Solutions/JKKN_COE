/**
 * exam_registrations.registration_status
 * =====================================================
 * The column carries two different kinds of value, which is easy to miss:
 *
 *   Approval state   Pending -> Approved / Rejected
 *   Application state Applied  (the learner has applied and been priced)
 *
 * 'Applied' is stamped by the Exam Application screens on top of an already
 * approved registration - it is a LATER state, not an alternative to Approved.
 * So every consumer that means "this registration is live" has to accept both.
 *
 * Filtering `.eq('registration_status', 'Approved')` looks right and is not: a
 * learner disappears from hall tickets, seating, attendance and the result views
 * the moment they apply for the exam. Use ACTIVE_REGISTRATION_STATUSES with
 * `.in()` instead.
 *
 * 'Approved' itself is written by two different steps:
 *
 *   Pending -> Approved             registration approved, NOT yet applied for
 *   Pending -> Applied -> Approved  final approval of the fee (the live flow)
 *
 * Only the second one is past 'Applied'. The final approval RPC always stamps
 * payment_date alongside the status, so that column tells the two apart - see
 * isFinalApprovedRegistration(). Testing `=== 'Applied'` alone for "has this been
 * applied for" reports every final-approved learner as not applied, and lets the
 * Exam Application screens drag an approved row back to 'Applied'.
 */

/** Statuses that mean the registration is live and should be acted on downstream */
export const ACTIVE_REGISTRATION_STATUSES: string[] = ['Approved', 'Applied']

/** Statuses the Exam Application screens must never re-apply */
export const TERMINAL_REGISTRATION_STATUSES: string[] = ['Applied', 'Cancelled', 'Rejected', 'Withdrawn']

/** The columns needed to place a row in the application flow - select both */
export interface RegistrationStatusRow {
	registration_status?: string | null
	payment_date?: string | null
}

/** 'Approved' by the final approval screen - the fee is settled, the row is closed */
export function isFinalApprovedRegistration(row: RegistrationStatusRow): boolean {
	const value = String(row.registration_status || '').trim().toUpperCase()
	return value === 'APPROVED' && Boolean(row.payment_date)
}

/** The learner has applied for this paper - still 'Applied', or already final-approved */
export function isApplicationDone(row: RegistrationStatusRow): boolean {
	const value = String(row.registration_status || '').trim().toUpperCase()
	return value === 'APPLIED' || isFinalApprovedRegistration(row)
}

/** Case-insensitive membership test for a status value read back from a row */
export function isActiveRegistrationStatus(status: string | null | undefined): boolean {
	const value = String(status || '').trim().toUpperCase()
	return ACTIVE_REGISTRATION_STATUSES.some(s => s.toUpperCase() === value)
}
