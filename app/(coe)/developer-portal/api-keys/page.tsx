import { redirect } from 'next/navigation'

// Standalone API Keys page has been merged into the Applications detail view.
// Redirect users who navigate here directly.
export default function ApiKeysRedirect() {
	redirect('/developer-portal/applications')
}
