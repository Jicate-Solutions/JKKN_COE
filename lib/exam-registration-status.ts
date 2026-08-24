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
 */

/** Statuses that mean the registration is live and should be acted on downstream */
export const ACTIVE_REGISTRATION_STATUSES: string[] = ['Approved', 'Applied']

/** Statuses the Exam Application screens must never re-apply */
export const TERMINAL_REGISTRATION_STATUSES: string[] = ['Applied', 'Cancelled', 'Rejected', 'Withdrawn']

/** Case-insensitive membership test for a status value read back from a row */
export function isActiveRegistrationStatus(status: string | null | undefined): boolean {
	const value = String(status || '').trim().toUpperCase()
	return ACTIVE_REGISTRATION_STATUSES.some(s => s.toUpperCase() === value)
}
