import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from 'lucide-react'

interface StudentInfoCardProps {
	student: {
		id: string
		name: string
		register_number: string
		program_code: string
		program_name?: string
		photo_url: string | null
	}
	sessionCode?: string
	theorySubjectCount: number
}

export default function StudentInfoCard({
	student,
	sessionCode,
	theorySubjectCount,
}: StudentInfoCardProps) {
	// Get initials for avatar fallback
	const getInitials = (name: string) => {
		const parts = name.split(' ')
		if (parts.length >= 2) {
			return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
		}
		return name.substring(0, 2).toUpperCase()
	}

	return (
		<Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
			<CardContent className="pt-6">
				<div className="flex items-start gap-4">
					{/* Student Photo */}
					<Avatar className="h-20 w-20 border-2 border-blue-300">
						<AvatarImage src={student.photo_url || undefined} alt={student.name} />
						<AvatarFallback className="bg-blue-100 text-blue-700 text-lg font-semibold">
							{getInitials(student.name)}
						</AvatarFallback>
					</Avatar>

					{/* Student Details */}
					<div className="flex-1 space-y-2">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
							{/* Register Number */}
							<div>
								<p className="text-xs text-gray-600 font-medium">Register Number</p>
								<p className="text-sm font-semibold text-gray-900">{student.register_number}</p>
							</div>

							{/* Name */}
							<div>
								<p className="text-xs text-gray-600 font-medium">Name</p>
								<p className="text-sm font-semibold text-gray-900">{student.name}</p>
							</div>

							{/* Program */}
							<div>
								<p className="text-xs text-gray-600 font-medium">Program</p>
								<p className="text-sm font-semibold text-gray-900">
									{student.program_code}
									{student.program_name && ` - ${student.program_name}`}
								</p>
							</div>

							{/* Session (if provided) */}
							{sessionCode && (
								<div>
									<p className="text-xs text-gray-600 font-medium">Exam Session</p>
									<p className="text-sm font-semibold text-gray-900">{sessionCode}</p>
								</div>
							)}

							{/* Theory Subject Count */}
							<div>
								<p className="text-xs text-gray-600 font-medium">Eligible Theory Subjects</p>
								<p className="text-sm font-semibold text-blue-700">{theorySubjectCount}</p>
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	)
}
