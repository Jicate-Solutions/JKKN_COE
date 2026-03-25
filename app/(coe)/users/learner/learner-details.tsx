'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, ArrowLeft, User, GraduationCap, Users, MapPin } from 'lucide-react'

interface LearnerDetails {
	id: string
	first_name: string
	last_name: string | null
	roll_number: string
	learner_email: string
	college_email: string
	learner_mobile: string
	father_name: string
	father_mobile: string
	mother_name: string
	mother_mobile: string
	date_of_birth: string
	gender: string
	religion: string
	community: string
	institution: { id: string; name: string }
	department: { id: string; department_name: string }
	program: { id: string; program_name: string }
	degree: { id: string; degree_name: string }
	is_profile_complete: boolean
	permanent_address_street: string
	permanent_address_district: string
	permanent_address_state: string
	permanent_address_pin_code: string
	entry_type: string
	accommodation_type: string
	bus_required: boolean
	bus_route: string
	bus_pickup_location: string
}

interface LearnerDetailsProps {
	learnerId: string
	onBack: () => void
}

export default function LearnerDetailsComponent({ learnerId, onBack }: LearnerDetailsProps) {
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [learner, setLearner] = useState<LearnerDetails | null>(null)

	useEffect(() => {
		const fetchLearnerDetails = async () => {
			try {
				setLoading(true)
				setError(null)

				const response = await fetch(`/api/api-management/learners/${learnerId}`)

				if (!response.ok) {
					if (response.status === 404) {
						throw new Error('Learner not found')
					}
					const errorData = await response.json().catch(() => ({}))
					throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
				}

				const responseData = await response.json()
				// Handle both formats: direct data or { data: {...} }
				const data = responseData.data || responseData
				setLearner(data)
			} catch (err) {
				setError(err instanceof Error ? err.message : 'An error occurred')
				console.error('Error fetching learner details:', err)
			} finally {
				setLoading(false)
			}
		}

		fetchLearnerDetails()
	}, [learnerId])

	if (loading) {
		return (
			<div className="flex justify-center items-center py-12">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<span className="ml-2 text-muted-foreground">Loading learner details...</span>
			</div>
		)
	}

	if (error) {
		return (
			<div className="py-8 text-center">
				<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 mb-4">
					<p className="text-destructive font-medium">{error}</p>
				</div>
				<Button onClick={onBack} variant="outline">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Learners
				</Button>
			</div>
		)
	}

	if (!learner) {
		return (
			<div className="py-8 text-center">
				<p className="text-muted-foreground mb-4">No learner data available</p>
				<Button onClick={onBack} variant="outline">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back to Learners
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex justify-between items-start">
				<Button onClick={onBack} variant="outline">
					<ArrowLeft className="mr-2 h-4 w-4" />
					Back
				</Button>

				<Badge
					variant={learner.is_profile_complete ? 'default' : 'outline'}
					className={
						learner.is_profile_complete
							? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-200 dark:border-green-800'
							: 'bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-900/20 dark:text-orange-200 dark:border-orange-800'
					}
				>
					{learner.is_profile_complete ? 'Complete Profile' : 'Incomplete Profile'}
				</Badge>
			</div>

			{/* Learner Name and Roll Number */}
			<div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-lg p-6 border">
				<h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
					{learner.first_name} {learner.last_name || ''}
				</h1>
				<p className="text-muted-foreground mt-1 text-lg">
					{learner.roll_number ? `Roll No: ${learner.roll_number}` : 'No Roll Number'}
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* Basic Information */}
				<Card>
					<CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
						<div className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 flex items-center justify-center">
								<User className="h-4 w-4 text-white" />
							</div>
							<CardTitle>Basic Information</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-3">
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Email:</p>
								<p className="text-sm col-span-2">{learner.learner_email || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">College Email:</p>
								<p className="text-sm col-span-2">{learner.college_email || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Mobile:</p>
								<p className="text-sm col-span-2">{learner.learner_mobile || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Date of Birth:</p>
								<p className="text-sm col-span-2">
									{learner.date_of_birth
										? new Date(learner.date_of_birth).toLocaleDateString('en-IN')
										: 'Not Available'}
								</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Gender:</p>
								<p className="text-sm col-span-2">{learner.gender || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Entry Type:</p>
								<p className="text-sm col-span-2">{learner.entry_type || 'Not Available'}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Academic Information */}
				<Card>
					<CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
						<div className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 flex items-center justify-center">
								<GraduationCap className="h-4 w-4 text-white" />
							</div>
							<CardTitle>Academic Information</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-3">
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Institution:</p>
								<p className="text-sm col-span-2">{learner.institution?.name || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Degree:</p>
								<p className="text-sm col-span-2">{learner.degree?.degree_name || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Department:</p>
								<p className="text-sm col-span-2">{learner.department?.department_name || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Program:</p>
								<p className="text-sm col-span-2">{learner.program?.program_name || 'Not Available'}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Family Information */}
				<Card>
					<CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20">
						<div className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-purple-500 to-pink-600 flex items-center justify-center">
								<Users className="h-4 w-4 text-white" />
							</div>
							<CardTitle>Family Information</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-3">
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Father's Name:</p>
								<p className="text-sm col-span-2">{learner.father_name || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Father's Mobile:</p>
								<p className="text-sm col-span-2">{learner.father_mobile || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Mother's Name:</p>
								<p className="text-sm col-span-2">{learner.mother_name || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Mother's Mobile:</p>
								<p className="text-sm col-span-2">{learner.mother_mobile || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Religion:</p>
								<p className="text-sm col-span-2">{learner.religion || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Community:</p>
								<p className="text-sm col-span-2">{learner.community || 'Not Available'}</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Address & Transport Information */}
				<Card>
					<CardHeader className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20">
						<div className="flex items-center gap-3">
							<div className="h-8 w-8 rounded-lg bg-gradient-to-r from-orange-500 to-amber-600 flex items-center justify-center">
								<MapPin className="h-4 w-4 text-white" />
							</div>
							<CardTitle>Address & Transport</CardTitle>
						</div>
					</CardHeader>
					<CardContent className="pt-6">
						<div className="space-y-3">
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Street:</p>
								<p className="text-sm col-span-2">{learner.permanent_address_street || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">District:</p>
								<p className="text-sm col-span-2">{learner.permanent_address_district || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">State:</p>
								<p className="text-sm col-span-2">{learner.permanent_address_state || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">PIN Code:</p>
								<p className="text-sm col-span-2">{learner.permanent_address_pin_code || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Accommodation:</p>
								<p className="text-sm col-span-2">{learner.accommodation_type || 'Not Available'}</p>
							</div>
							<div className="grid grid-cols-3 gap-2">
								<p className="text-sm font-medium text-muted-foreground">Bus Required:</p>
								<p className="text-sm col-span-2">
									<Badge variant={learner.bus_required ? 'default' : 'outline'}>
										{learner.bus_required ? 'Yes' : 'No'}
									</Badge>
								</p>
							</div>
							{learner.bus_required && (
								<>
									<div className="grid grid-cols-3 gap-2">
										<p className="text-sm font-medium text-muted-foreground">Bus Route:</p>
										<p className="text-sm col-span-2">{learner.bus_route || 'Not Available'}</p>
									</div>
									<div className="grid grid-cols-3 gap-2">
										<p className="text-sm font-medium text-muted-foreground">Pickup Location:</p>
										<p className="text-sm col-span-2">{learner.bus_pickup_location || 'Not Available'}</p>
									</div>
								</>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
