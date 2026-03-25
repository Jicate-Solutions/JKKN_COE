'use client'

import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Info } from 'lucide-react'
import BulkApplicationForm from './bulk-application-form'

export default function BulkApplicationTab() {
	const [refreshKey, setRefreshKey] = useState(0)

	const handleFormSuccess = () => {
		// Increment key to trigger refresh (for future draft list integration)
		setRefreshKey((prev) => prev + 1)
	}

	return (
		<div className="space-y-6">
			{/* Info Alert */}
			<Alert className="bg-blue-50 border-blue-200">
				<Info className="h-4 w-4 text-blue-600" />
				<AlertDescription className="text-blue-800">
					Use this form to add multiple students for revaluation in bulk. Students will be added to a
					draft status and can be reviewed before finalization.
				</AlertDescription>
			</Alert>

			{/* Bulk Application Form */}
			<BulkApplicationForm onSuccess={handleFormSuccess} />

			{/* Note: Draft list will appear here after session selection in form */}
		</div>
	)
}
