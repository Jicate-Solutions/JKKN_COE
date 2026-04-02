import { redirect } from 'next/navigation'

// Standalone Permissions page has been merged into the Applications detail view.
// Redirect users who navigate here directly.
export default function PermissionsRedirect() {
	redirect('/developer-portal/applications')
}
