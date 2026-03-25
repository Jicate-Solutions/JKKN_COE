import { Badge } from '@/components/ui/badge'
import type { RevaluationStatus } from '@/types/revaluation'

interface RevaluationStatusBadgeProps {
	status: RevaluationStatus
	className?: string
}

export default function RevaluationStatusBadge({ status, className = '' }: RevaluationStatusBadgeProps) {
	const getStatusConfig = (status: RevaluationStatus) => {
		switch (status) {
			case 'Applied':
			case 'Payment Pending':
				return {
					variant: 'secondary' as const,
					className: 'bg-amber-100 text-amber-800 border-amber-300',
					label: status,
				}
			case 'Payment Verified':
				return {
					variant: 'default' as const,
					className: 'bg-blue-100 text-blue-800 border-blue-300',
					label: status,
				}
			case 'Approved':
				return {
					variant: 'default' as const,
					className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
					label: 'Approved',
				}
			case 'Rejected':
				return {
					variant: 'destructive' as const,
					className: 'bg-red-100 text-red-800 border-red-300',
					label: 'Rejected',
				}
			case 'Assigned':
				return {
					variant: 'default' as const,
					className: 'bg-purple-100 text-purple-800 border-purple-300',
					label: 'Assigned',
				}
			case 'In Progress':
				return {
					variant: 'default' as const,
					className: 'bg-cyan-100 text-cyan-800 border-cyan-300',
					label: 'In Progress',
				}
			case 'Evaluated':
				return {
					variant: 'default' as const,
					className: 'bg-teal-100 text-teal-800 border-teal-300',
					label: 'Evaluated',
				}
			case 'Verified':
				return {
					variant: 'default' as const,
					className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
					label: 'Verified',
				}
			case 'Published':
				return {
					variant: 'default' as const,
					className: 'bg-green-100 text-green-800 border-green-300',
					label: 'Published',
				}
			case 'Cancelled':
				return {
					variant: 'secondary' as const,
					className: 'bg-gray-100 text-gray-800 border-gray-300',
					label: 'Cancelled',
				}
			default:
				return {
					variant: 'secondary' as const,
					className: 'bg-gray-100 text-gray-800 border-gray-300',
					label: status,
				}
		}
	}

	const config = getStatusConfig(status)

	return (
		<Badge variant={config.variant} className={`${config.className} ${className}`}>
			{config.label}
		</Badge>
	)
}
