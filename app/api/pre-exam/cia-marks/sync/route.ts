/**
 * Redirect: POST /api/pre-exam/cia-marks/sync → /api/v1/cia-marks/sync
 *
 * The CIA marks sync endpoint has moved to the v1 API with full
 * Developer Portal auth + permissions (cia-marks:create).
 *
 * This redirect exists for backward compatibility.
 */
export { POST } from '@/app/api/v1/cia-marks/sync/route'
