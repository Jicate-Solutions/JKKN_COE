'use client'

// Examiner portal — "Profile": the registration form, read only.
//
// Mirrors the sections of the public registration forms
// (/engg-examiner-registration and /arts-examiner-registration) so the
// examiner sees exactly what the CoE holds on file. Fields that do not
// apply to the examiner's stream are simply not shown.

import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
	AlertCircle, BookOpen, Briefcase, Building2, ClipboardCheck, GraduationCap,
	Loader2, Phone, RefreshCw, User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>

interface BoardAssociation {
	board_code: string
	willing_for_valuation: boolean
	willing_for_practical: boolean
	willing_for_scrutiny: boolean
	board?: { board_name?: string; board_type?: string } | null
}

interface Registration {
	examiner: Row
	boards: BoardAssociation[]
}

const STATUS: Record<string, { label: string; className: string }> = {
	PENDING: { label: 'Pending Approval', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
	ACTIVE: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
	INACTIVE: { label: 'Inactive', className: 'bg-gray-100 text-gray-600 border-gray-200' },
	REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700 border-red-200' },
}

const EMPTY = '—'

const has = (v: unknown) =>
	v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '')

const years = (v: unknown) => (has(v) ? `${v} years` : EMPTY)

function Field({ label, value }: { label: string; value?: unknown }) {
	return (
		<div className="space-y-1">
			<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
			<p className="text-sm text-gray-900 break-words">{has(value) ? String(value) : EMPTY}</p>
		</div>
	)
}

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: typeof User
	title: string
	children: React.ReactNode
}) {
	return (
		<Card>
			<CardContent className="p-5 space-y-4">
				<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
					<Icon className="w-4 h-4 text-emerald-600" /> {title}
				</h3>
				{children}
			</CardContent>
		</Card>
	)
}

function CourseList({ title, items }: { title: string; items: { course: string }[] }) {
	if (items.length === 0) return null
	return (
		<div className="space-y-2">
			<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{title}</p>
			<div className="space-y-1.5">
				{items.map((c, i) => (
					<div key={i} className="p-2.5 bg-gray-50 rounded-md text-sm text-gray-900">
						{c.course}
					</div>
				))}
			</div>
		</div>
	)
}

export function ProfileSection() {
	const [data, setData] = useState<Registration | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)

	const load = async () => {
		setLoading(true)
		setError(null)
		try {
			const res = await fetch('/api/examiner-portal/registration')
			const json = await res.json().catch(() => ({}))
			if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
			setData(json)
		} catch (e: any) {
			setError(e.message || 'Your registration could not be loaded.')
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		load()
	}, [])

	if (loading) {
		return (
			<div className="py-20 flex justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !data) {
		return (
			<Card>
				<CardContent className="p-10 text-center space-y-3">
					<AlertCircle className="h-8 w-8 mx-auto text-red-500" />
					<p className="font-medium">{error || 'Your registration could not be loaded.'}</p>
					<Button variant="outline" size="sm" onClick={load}>
						<RefreshCw className="h-4 w-4 mr-1.5" /> Try again
					</Button>
				</CardContent>
			</Card>
		)
	}

	const ex = data.examiner
	const isEngineering = ex.form_type === 'engineering'
	const status = STATUS[String(ex.status)] ?? STATUS.PENDING
	const ad = (ex.additional_data || {}) as Row
	const spec = (ad.specializations || {}) as Row
	const courses = (ad.courses || {}) as Record<string, { course: string }[]>
	const theory = courses.theory || []
	const practical = courses.practical || []
	const roles = (ex.willingness_roles as string[] | null) || []

	return (
		<div className="space-y-4 max-w-3xl">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-semibold">Profile</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Your examiner registration as held by the Office of the Controller of Examinations.
					</p>
				</div>
				<Badge variant="outline" className={cn('border font-medium', status.className)}>
					{status.label}
				</Badge>
			</div>

			<div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
				<AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
				<span>
					This profile is read only. To correct any detail, contact the Office of the CoE.
					{has(ex.status_remarks) && <> Remarks: {String(ex.status_remarks)}</>}
				</span>
			</div>

			<Section icon={User} title="Personal Information">
				<div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
					<p className="text-xs text-emerald-700 font-medium">E-mail (Google Verified)</p>
					<p className="text-sm font-semibold text-emerald-900 mt-0.5 break-all">{String(ex.email)}</p>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{isEngineering && <Field label="Salutation" value={ex.salutation} />}
					<Field label="Full Name" value={ex.full_name} />
					{isEngineering && <Field label="Gender" value={ex.gender} />}
					<Field label="Designation" value={ex.designation} />
					{isEngineering && <Field label="Highest Qualification" value={ex.highest_qualification} />}
					<Field label="Department" value={ex.department} />
				</div>
			</Section>

			<Section icon={Phone} title="Contact Details">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<Field label="Mobile" value={ex.mobile} />
					{isEngineering && <Field label="Personal Email" value={ex.personal_email} />}
					{isEngineering && <Field label="Official Email" value={ex.official_email} />}
				</div>
			</Section>

			<Section icon={Building2} title="Institutional Details">
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{isEngineering && <Field label="AICTE/AU Faculty Code" value={ex.aicte_faculty_code} />}
					<Field label="Working Institution" value={ex.institution_name} />
				</div>
				<Field label="Address & Pincode" value={ex.institution_address} />
				{isEngineering && (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field label="Institution COE Contact" value={ex.institution_coe_contact} />
						<Field label="Institution COE Email" value={ex.institution_coe_email} />
					</div>
				)}
			</Section>

			{isEngineering ? (
				<>
					<Section icon={Briefcase} title="Experience">
						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<Field label="Teaching Experience" value={years(ex.teaching_exp_years)} />
							<Field label="Industry Experience" value={years(ex.industry_exp_years)} />
							<Field label="Total Experience" value={years(ex.total_exp_years)} />
						</div>
					</Section>

					<Section icon={GraduationCap} title="Academic Profile">
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<Field label="UG Specialization" value={spec.ug} />
							<Field label="PG Specialization" value={spec.pg} />
						</div>
						<Field label="PhD Specialization" value={spec.phd} />
						<Field label="Area of Expertise" value={ex.area_of_expertise} />
					</Section>

					{(theory.length > 0 || practical.length > 0) && (
						<Section icon={BookOpen} title="Courses">
							<CourseList title="Theory Courses" items={theory} />
							<CourseList title="Practical Courses" items={practical} />
						</Section>
					)}

					<Section icon={ClipboardCheck} title="Examiner Preferences">
						{roles.length > 0 ? (
							<div className="flex flex-wrap gap-2">
								{roles.map((role, i) => (
									<Badge key={i} variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">
										{role}
									</Badge>
								))}
							</div>
						) : (
							<p className="text-sm text-gray-400">No preferences specified</p>
						)}
					</Section>
				</>
			) : (
				<Section icon={GraduationCap} title="Board & Experience">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<Field label="UG Experience" value={years(ex.ug_experience_years)} />
						<Field label="PG Experience" value={years(ex.pg_experience_years)} />
					</div>
					{data.boards.length > 0 ? (
						<div className="space-y-2">
							{data.boards.map((b, i) => (
								<div key={i} className="p-3 bg-gray-50 border border-gray-100 rounded-lg">
									<div className="flex items-center justify-between gap-2">
										<p className="text-sm font-medium text-gray-900">{b.board?.board_name || b.board_code}</p>
										<Badge variant="outline" className="text-xs">{b.board?.board_type || 'UG'}</Badge>
									</div>
									<div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
										{b.willing_for_valuation && <span className="text-emerald-600">Valuation</span>}
										{b.willing_for_practical && <span className="text-emerald-600">Practical</span>}
										{b.willing_for_scrutiny && <span className="text-emerald-600">Scrutiny</span>}
									</div>
								</div>
							))}
						</div>
					) : (
						<p className="text-sm text-gray-400">No board associations</p>
					)}
				</Section>
			)}
		</div>
	)
}
