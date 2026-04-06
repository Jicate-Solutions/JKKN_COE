'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Script from 'next/script'
import { useNonce } from '@/components/common/nonce-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/common/use-toast'
import {
	CheckCircle2,
	Loader2,
	Mail,
	User,
	Phone,
	Building2,
	GraduationCap,
	Send,
	AlertCircle,
	ShieldCheck,
	ChevronRight,
	LogOut,
	Briefcase,
	BookOpen,
	ClipboardCheck,
	FileText,
} from 'lucide-react'
import {
	ExaminerFormConfig,
	EngineeringExaminerFormData,
	DEFAULT_ENGINEERING_FORM,
} from '@/types/examiner'

// ── Constants ────────────────────────────────────────────────────────────────

const INSTITUTION_CODE = 'CET'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GooglePayload {
	email: string
	email_verified: boolean
	name: string
	given_name?: string
	picture?: string
}

declare global {
	interface Window {
		google: {
			accounts: {
				id: {
					initialize: (config: object) => void
					renderButton: (el: HTMLElement | null, config: object) => void
					prompt: () => void
					cancel: () => void
				}
			}
		}
	}
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EnggExaminerRegistrationPage() {
	const { toast } = useToast()
	const nonce = useNonce()

	// Google auth
	const [googleVerified, setGoogleVerified] = useState(false)
	const [googleUser, setGoogleUser] = useState<GooglePayload | null>(null)
	const [gsiReady, setGsiReady] = useState(false)

	// Form config
	const [formConfig, setFormConfig] = useState<ExaminerFormConfig | null>(null)

	// Form data
	const [formData, setFormData] = useState<EngineeringExaminerFormData>(DEFAULT_ENGINEERING_FORM)

	// UI state
	const [loading, setLoading] = useState(true)
	const [submitting, setSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(false)
	const [alreadySubmitted, setAlreadySubmitted] = useState<'PENDING' | 'ACTIVE' | 'REJECTED' | null>(null)
	const [checkingStatus, setCheckingStatus] = useState(false)
	const [existingRegistration, setExistingRegistration] = useState<{
		examiner: Record<string, unknown>
	} | null>(null)
	const [errors, setErrors] = useState<Record<string, string>>({})

	// ── Load form config ────────────────────────────────────────────────────

	useEffect(() => {
		const fetchConfig = async () => {
			try {
				const res = await fetch('/api/public/form-config/engg-examiner-registration')
				if (res.ok) {
					setFormConfig(await res.json())
				}
			} catch (e) {
				console.error('Error fetching form config:', e)
			} finally {
				setLoading(false)
			}
		}
		fetchConfig()
	}, [])

	// ── Google Identity Services ────────────────────────────────────────────

	const handleGoogleCredential = useCallback(async (response: { credential: string }) => {
		try {
			const base64 = response.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
			const payload: GooglePayload = JSON.parse(atob(base64))

			setGoogleUser(payload)
			setGoogleVerified(true)
			setFormData(prev => ({
				...prev,
				personal_email: prev.personal_email || payload.email,
			}))

			// Check if this email is already registered
			setCheckingStatus(true)
			try {
				const res = await fetch(`/api/public/examiner/status?email=${encodeURIComponent(payload.email)}`)
				const data = await res.json()
				if (data.exists) {
					setExistingRegistration({ examiner: data.examiner })
				}
			} catch {
				// silently ignore — just show the registration form
			} finally {
				setCheckingStatus(false)
			}
		} catch {
			toast({ title: '❌ Google Sign-In Failed', description: 'Please try again.', variant: 'destructive' })
		}
	}, [toast])

	const initGoogleSignIn = useCallback(() => {
		if (!window.google?.accounts?.id) return

		const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
		if (!clientId) return

		window.google.accounts.id.initialize({
			client_id: clientId,
			callback: handleGoogleCredential,
			auto_select: false,
			cancel_on_tap_outside: true,
		})

		setTimeout(() => {
			const btnEl = document.getElementById('google-signin-btn')
			const containerWidth = btnEl?.parentElement?.offsetWidth ?? Math.min(window.innerWidth - 64, 480)
			window.google.accounts.id.renderButton(
				btnEl,
				{ theme: 'outline', size: 'large', width: containerWidth, text: 'signin_with', shape: 'rectangular', logo_alignment: 'left' }
			)
			setGsiReady(true)
		}, 100)
	}, [handleGoogleCredential])

	// ── Validation ──────────────────────────────────────────────────────────

	const validate = () => {
		const e: Record<string, string> = {}

		// Personal
		if (!formData.salutation) e.salutation = 'Required'
		if (!formData.full_name.trim()) e.full_name = 'Name is required'
		if (formData.full_name.trim() && !/^[A-Z\s.]+$/.test(formData.full_name.trim()))
			e.full_name = 'Name must be uppercase letters only'
		if (!formData.gender) e.gender = 'Required'
		if (!formData.designation && !formData.designation_other) e.designation = 'Required'
		if (!formData.highest_qualification.trim()) e.highest_qualification = 'Required'

		// Contact
		if (!formData.mobile.trim()) e.mobile = 'Required'
		if (formData.mobile && !/^[6-9][0-9]{9}$/.test(formData.mobile.replace(/\s/g, '')))
			e.mobile = 'Enter valid 10-digit Indian mobile number'
		if (!formData.personal_email.trim()) e.personal_email = 'Required'
		if (formData.personal_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personal_email))
			e.personal_email = 'Invalid email'
		if (!formData.official_email.trim()) e.official_email = 'Required'
		if (formData.official_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.official_email))
			e.official_email = 'Invalid email'

		// Institutional
		if (!formData.aicte_faculty_code.trim()) e.aicte_faculty_code = 'Required'
		if (!formData.institution_name.trim()) e.institution_name = 'Required'
		if (!formData.address_pincode.trim()) e.address_pincode = 'Required'
		if (!formData.institution_coe_contact.trim()) e.institution_coe_contact = 'Required'
		if (!formData.institution_coe_email.trim()) e.institution_coe_email = 'Required'
		if (formData.institution_coe_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.institution_coe_email))
			e.institution_coe_email = 'Invalid email'

		// Experience
		if (!formData.teaching_exp_years) e.teaching_exp_years = 'Required'
		if (!formData.total_exp_years) e.total_exp_years = 'Required'
		if (Number(formData.total_exp_years) < Number(formData.teaching_exp_years))
			e.total_exp_years = 'Must be >= teaching experience'

		// Academic
		const dept = formData.department || formData.department_other
		if (!dept) e.department = 'Required'
		if (!formData.ug_specialization.trim()) e.ug_specialization = 'Required'
		if (!formData.pg_specialization.trim()) e.pg_specialization = 'Required'

		// Willingness
		if (formData.willingness_roles.length === 0) e.willingness_roles = 'Select at least one role'

		// Courses
		const hasTheory = formData.theory_courses.some(c => c.course.trim())
		if (!hasTheory) e.theory_courses = 'At least one theory course required'
		const hasPractical = formData.practical_courses.some(c => c.course.trim())
		if (!hasPractical) e.practical_courses = 'At least one practical course required'

		// Declaration
		if (!formData.declaration_acknowledged) e.declaration = 'You must acknowledge the declaration'

		setErrors(e)
		return Object.keys(e).length === 0
	}

	// ── Submit ──────────────────────────────────────────────────────────────

	const handleSubmit = async () => {
		if (!validate()) {
			toast({ title: '⚠️ Please fix all errors', variant: 'destructive' })
			return
		}
		try {
			setSubmitting(true)
			const res = await fetch('/api/public/examiner/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					...formData,
					form_type: 'engineering',
					email: googleUser?.email || '',
					institution_code: INSTITUTION_CODE,
					google_verified: googleVerified,
					email_verified: googleVerified,
					google_profile_picture: googleUser?.picture || '',
					full_name: formData.full_name.toUpperCase(),
					designation: formData.designation === 'Other' ? formData.designation_other : formData.designation,
					department: formData.department === 'Other' ? formData.department_other : formData.department,
				}),
			})
			const data = await res.json()
			if (!res.ok) {
				if (data.status === 'PENDING' || data.status === 'ACTIVE' || data.status === 'REJECTED') {
					setAlreadySubmitted(data.status)
					return
				}
				throw new Error(data.error || 'Registration failed')
			}
			setSubmitted(true)
		} catch (error) {
			toast({
				title: '❌ Registration Failed',
				description: error instanceof Error ? error.message : 'Please try again.',
				variant: 'destructive',
			})
		} finally {
			setSubmitting(false)
		}
	}

	// ── Helper functions for course updates ─────────────────────────────────

	const updateTheoryCourse = (index: number, value: string) => {
		setFormData(prev => {
			const updated = [...prev.theory_courses]
			updated[index] = { course: value }
			return { ...prev, theory_courses: updated }
		})
	}

	const updatePracticalCourse = (index: number, value: string) => {
		setFormData(prev => {
			const updated = [...prev.practical_courses]
			updated[index] = { course: value }
			return { ...prev, practical_courses: updated }
		})
	}

	// ── Already Registered Screen ────────────────────────────────────────────

	if (alreadySubmitted) {
		const config = {
			PENDING: {
				icon: <Loader2 className="w-10 h-10 text-yellow-500" />,
				bg: 'from-yellow-50 to-white',
				iconBg: 'bg-yellow-100',
				title: 'Registration Already Submitted',
				message: 'Your registration is already pending approval. You will be notified via email once it is approved.',
			},
			ACTIVE: {
				icon: <CheckCircle2 className="w-10 h-10 text-blue-600" />,
				bg: 'from-blue-50 to-white',
				iconBg: 'bg-blue-100',
				title: 'Already Registered',
				message: 'You are already registered as an examiner. Please contact the examination office if you need any changes.',
			},
			REJECTED: {
				icon: <AlertCircle className="w-10 h-10 text-red-500" />,
				bg: 'from-red-50 to-white',
				iconBg: 'bg-red-100',
				title: 'Registration Rejected',
				message: 'Your previous registration was rejected. Please contact the examination office for further assistance.',
			},
		}[alreadySubmitted]

		return (
			<div className={`min-h-screen bg-gradient-to-br ${config.bg} flex items-center justify-center p-4`}>
				<div className="w-full max-w-sm text-center space-y-6 py-12">
					<div className={`w-20 h-20 ${config.iconBg} rounded-full flex items-center justify-center mx-auto`}>
						{config.icon}
					</div>
					<div className="space-y-2">
						<h2 className="text-2xl font-bold text-gray-900">{config.title}</h2>
						<p className="text-gray-600 text-sm leading-relaxed">{config.message}</p>
					</div>
				</div>
			</div>
		)
	}

	// ── Checking Status Screen ───────────────────────────────────────────────

	if (checkingStatus) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="text-center space-y-3">
					<Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
					<p className="text-sm text-gray-500">Checking your registration status...</p>
				</div>
			</div>
		)
	}

	// ── Loading Screen ───────────────────────────────────────────────────────

	if (loading) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="text-center space-y-3">
					<Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
					<p className="text-sm text-gray-500">Loading form...</p>
				</div>
			</div>
		)
	}

	// ── Existing Registration View ──────────────────────────────────────────

	if (existingRegistration) {
		const ex = existingRegistration.examiner as Record<string, unknown>
		const isEditable = ex.is_enable === true
		const statusConfig: Record<string, { label: string; className: string }> = {
			PENDING:  { label: 'Pending Approval', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
			ACTIVE:   { label: 'Active',            className: 'bg-blue-100 text-blue-700 border-blue-200' },
			INACTIVE: { label: 'Inactive',           className: 'bg-gray-100 text-gray-600 border-gray-200' },
			REJECTED: { label: 'Rejected',           className: 'bg-red-100 text-red-700 border-red-200' },
		}
		const statusStyle = statusConfig[ex.status as string] ?? statusConfig['PENDING']

		const Field = ({ label, value }: { label: string; value?: unknown }) => (
			<div className="space-y-1">
				<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
				<p className="text-sm text-gray-900">{String(value || '\u2014')}</p>
			</div>
		)

		return (
			<div className="min-h-screen bg-gray-50">
				{/* Institution Header */}
				<div className="bg-white shadow-sm">
					<div className="h-1 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
					<div className="max-w-3xl mx-auto px-4 py-6">
						<div className="flex items-center gap-5">
							<Image src="/jkkncet_logo.png" alt="JKKNCET" width={120} height={120} className="object-contain flex-shrink-0" />
							<div className="flex-1 text-center min-w-0">
								<h1 className="text-lg sm:text-xl font-extrabold text-gray-900 leading-tight tracking-wide uppercase">
									J.K.K. Nattraja College of Engineering &amp; Technology
								</h1>
								<p className="text-sm font-semibold text-green-700 mt-1.5 tracking-wider">(An Autonomous Institution)</p>
								<p className="text-xs text-pink-600 mt-1.5 leading-tight font-medium italic">
									Managed by J.K.K. Rangammal Charitable Trust
								</p>
								<p className="text-xs text-gray-500 mt-1 leading-tight">
									Approved by AICTE, New Delhi &amp; Affiliated to Anna University, Chennai
								</p>
								<p className="text-xs text-gray-400 mt-0.5">Natarajapuram, Kumarapalayam &ndash; 638 183, Namakkal Dt., Tamil Nadu</p>
							</div>
						</div>
					</div>
				</div>
				<div className="bg-gradient-to-r from-green-800 via-green-700 to-emerald-700 text-white shadow-lg">
					<div className="max-w-3xl mx-auto px-4 py-4 text-center">
						<h2 className="text-base font-bold tracking-widest uppercase">External Faculty Database Collection Form</h2>
						<p className="text-green-200 text-xs mt-1 tracking-wide">{formConfig?.exam_session_label || 'Apr/May-2026'} Examinations</p>
					</div>
				</div>

				{/* Content */}
				<div className="max-w-3xl mx-auto px-4 py-6 space-y-4 pb-8">

					{/* Status banner */}
					<div className={`flex items-center justify-between p-4 rounded-xl border ${statusStyle.className}`}>
						<div>
							<p className="font-semibold text-sm">Registration Status</p>
							{ex.status_remarks && (
								<p className="text-xs mt-0.5 opacity-80">{String(ex.status_remarks)}</p>
							)}
						</div>
						<Badge className={`${statusStyle.className} border font-medium`}>{statusStyle.label}</Badge>
					</div>

					{!isEditable && (
						<div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
							<AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
							<span>Your registration is view-only. Contact the examination office to make changes.</span>
						</div>
					)}

					{/* Personal Info */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<User className="w-4 h-4 text-blue-600" /> Personal Information
							</h3>
							<div className="grid grid-cols-1 gap-4">
								<div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
									<p className="text-xs text-blue-600 font-medium">E-mail (Google Verified)</p>
									<p className="text-sm font-semibold text-blue-900 mt-0.5">{String(ex.email)}</p>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<Field label="Salutation" value={ex.salutation} />
									<Field label="Full Name" value={ex.full_name} />
								</div>
								<div className="grid grid-cols-2 gap-4">
									<Field label="Gender" value={ex.gender} />
									<Field label="Designation" value={ex.designation} />
								</div>
								<Field label="Highest Qualification" value={ex.highest_qualification} />
							</div>
						</CardContent>
					</Card>

					{/* Contact */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<Phone className="w-4 h-4 text-blue-600" /> Contact Details
							</h3>
							<div className="grid grid-cols-2 gap-4">
								<Field label="Mobile" value={ex.mobile} />
								<Field label="Personal Email" value={ex.personal_email} />
							</div>
							<Field label="Official Email" value={ex.official_email} />
						</CardContent>
					</Card>

					{/* Institutional */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<Building2 className="w-4 h-4 text-blue-600" /> Institutional Details
							</h3>
							<div className="grid grid-cols-2 gap-4">
								<Field label="AICTE/AU Faculty Code" value={ex.aicte_faculty_code} />
								<Field label="Working Institution" value={ex.institution_name} />
							</div>
							<Field label="Address & Pincode" value={ex.institution_address} />
							<div className="grid grid-cols-2 gap-4">
								<Field label="Institution COE Contact" value={ex.institution_coe_contact} />
								<Field label="Institution COE Email" value={ex.institution_coe_email} />
							</div>
						</CardContent>
					</Card>

					{/* Experience */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<Briefcase className="w-4 h-4 text-blue-600" /> Experience
							</h3>
							<div className="grid grid-cols-3 gap-4">
								<Field label="Teaching Experience" value={`${ex.teaching_exp_years ?? 0} years`} />
								<Field label="Industry Experience" value={`${ex.industry_exp_years ?? 0} years`} />
								<Field label="Total Experience" value={`${ex.total_exp_years ?? 0} years`} />
							</div>
						</CardContent>
					</Card>

					{/* Academic */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<GraduationCap className="w-4 h-4 text-blue-600" /> Academic Profile
							</h3>
							<Field label="Department" value={ex.department} />
							<div className="grid grid-cols-2 gap-4">
								<Field label="UG Specialization" value={((ex.additional_data as Record<string, unknown>)?.specializations as Record<string, unknown>)?.ug} />
								<Field label="PG Specialization" value={((ex.additional_data as Record<string, unknown>)?.specializations as Record<string, unknown>)?.pg} />
							</div>
							<Field label="PhD Specialization" value={((ex.additional_data as Record<string, unknown>)?.specializations as Record<string, unknown>)?.phd} />
							<Field label="Area of Expertise" value={ex.area_of_expertise} />
						</CardContent>
					</Card>

					{/* Courses */}
					{(() => {
						const ad = ex.additional_data as Record<string, unknown>
						const courses = ad?.courses as Record<string, { course: string }[]> | undefined
						const theory = courses?.theory || []
						const practical = courses?.practical || []
						if (theory.length === 0 && practical.length === 0) return null
						return (
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2">
										<BookOpen className="w-4 h-4 text-blue-600" /> Courses
									</h3>
									{theory.length > 0 && (
										<div className="space-y-2">
											<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Theory Courses</p>
											<div className="space-y-1.5">
												{theory.map((c, i) => (
													<div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-sm">
														<span className="text-gray-900 flex-1">{c.course}</span>
													</div>
												))}
											</div>
										</div>
									)}
									{practical.length > 0 && (
										<div className="space-y-2">
											<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Practical Courses</p>
											<div className="space-y-1.5">
												{practical.map((c, i) => (
													<div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg text-sm">
														<span className="text-gray-900 flex-1">{c.course}</span>
													</div>
												))}
											</div>
										</div>
									)}
								</CardContent>
							</Card>
						)
					})()}

					{/* Willingness */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<ClipboardCheck className="w-4 h-4 text-blue-600" /> Examiner Preferences
							</h3>
							<div className="flex flex-wrap gap-2">
								{(ex.willingness_roles as string[] || []).map((role, i) => (
									<Badge key={i} variant="outline" className="text-blue-700 border-blue-200 bg-blue-50">
										{role}
									</Badge>
								))}
								{(!ex.willingness_roles || (ex.willingness_roles as string[]).length === 0) && (
									<p className="text-sm text-gray-400">No preferences specified</p>
								)}
							</div>
						</CardContent>
					</Card>

					{isEditable && (
						<Button
							onClick={() => setExistingRegistration(null)}
							className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base font-semibold rounded-xl"
						>
							Edit Registration
						</Button>
					)}

					{/* Sign Out */}
					<Button
						variant="outline"
						onClick={() => window.location.reload()}
						className="w-full h-10 text-sm rounded-xl border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200"
					>
						<LogOut className="w-4 h-4 mr-2" />
						Sign Out / Use Different Account
					</Button>
				</div>
			</div>
		)
	}

	// ── Success Screen ──────────────────────────────────────────────────────

	if (submitted) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
				<div className="w-full max-w-sm text-center space-y-6 py-12">
					<div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
						<CheckCircle2 className="w-10 h-10 text-blue-600" />
					</div>
					<div className="space-y-2">
						<h2 className="text-2xl font-bold text-gray-900">Registration Submitted!</h2>
						<p className="text-gray-600 text-sm leading-relaxed">
							Thank you! Your registration has been submitted successfully. We will notify you via email once your registration is approved.
						</p>
					</div>
					<Button onClick={() => window.location.reload()} variant="outline" className="w-full">
						Submit Another Registration
					</Button>
				</div>
			</div>
		)
	}

	// ── Main Page ────────────────────────────────────────────────────────────

	return (
		<>
			<Script src="https://accounts.google.com/gsi/client" onLoad={initGoogleSignIn} strategy="afterInteractive" nonce={nonce} />

			<div className="min-h-screen bg-gray-50">

				{/* ── Institution Header ── */}
				<div className="bg-white shadow-sm sticky top-0 z-10">
					<div className="h-1 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
					<div className="max-w-3xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
						<div className="flex items-center gap-3 sm:gap-5">
							<Image src="/jkkncet_logo.png" alt="JKKNCET" width={80} height={80} className="object-contain flex-shrink-0 w-14 h-14 sm:w-20 sm:h-20" />
							<div className="flex-1 text-center min-w-0">
								<h1 className="text-base sm:text-lg font-extrabold text-gray-900 leading-tight tracking-wide uppercase">
									J.K.K. Nattraja College of Engineering &amp; Technology
								</h1>
								<p className="text-xs sm:text-sm font-semibold text-green-700 mt-0.5 tracking-wider">(An Autonomous Institution)</p>
								<p className="hidden sm:block text-xs text-pink-600 mt-0.5 leading-tight font-medium italic">
									Managed by J.K.K. Rangammal Charitable Trust
								</p>
								<p className="hidden sm:block text-xs text-gray-500 mt-0.5 leading-tight">
									Approved by AICTE &amp; Affiliated to Anna University, Chennai
								</p>
								<p className="sm:hidden text-[10px] text-gray-500 mt-0.5 leading-tight">Affiliated to Anna University, Chennai</p>
								<p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Natarajapuram, Kumarapalayam &ndash; 638 183, Namakkal Dt., Tamil Nadu</p>
							</div>
						</div>
					</div>
				</div>

				{/* ── Title Banner ── */}
				<div className="bg-gradient-to-r from-green-800 via-green-700 to-emerald-700 text-white shadow-lg">
					<div className="max-w-3xl mx-auto px-4 py-4 sm:py-5 text-center">
						<h2 className="text-sm sm:text-base font-bold tracking-widest uppercase">External Faculty Database Collection</h2>
						<p className="text-blue-200 text-xs mt-1 tracking-wide">
							{formConfig?.exam_session_label || 'Apr/May-2026'} Examinations
						</p>
					</div>
				</div>

				{/* ── Content ── */}
				<div className="max-w-3xl mx-auto px-4 py-6 space-y-4 pb-24">

					{/* Step 1 — Google Verification */}
					<Card className="border-0 shadow-sm overflow-hidden">
						<CardContent className="p-5">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
								<h3 className="font-semibold text-gray-900">Verify Your Identity</h3>
								{googleVerified && (
									<Badge className="ml-auto bg-blue-100 text-blue-700 border-blue-200 text-xs flex-shrink-0">
										<CheckCircle2 className="w-3 h-3 mr-1" />Verified
									</Badge>
								)}
							</div>

							{/* Verified profile card */}
							{googleVerified && googleUser && (
								<div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-xl mb-3 overflow-hidden">
									{googleUser.picture && (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={googleUser.picture} alt="" width={40} height={40} className="rounded-full flex-shrink-0 w-10 h-10" />
									)}
									<div className="flex-1 min-w-0 overflow-hidden">
										<p className="font-semibold text-blue-900 text-sm truncate leading-tight">{googleUser.name}</p>
										<p className="text-xs text-blue-700 truncate leading-tight mt-0.5">{googleUser.email}</p>
									</div>
									<ShieldCheck className="w-5 h-5 text-blue-600 flex-shrink-0" />
								</div>
							)}

							{/* Sign Out link */}
							{googleVerified && (
								<button
									onClick={() => window.location.reload()}
									className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors mx-auto mt-1"
								>
									<LogOut className="w-3.5 h-3.5" />
									Not you? Sign out
								</button>
							)}

							{/* Google sign-in — always in DOM, hidden after verification */}
							<div className={googleVerified ? 'hidden' : 'space-y-4'}>
								<p className="text-sm text-gray-500 text-center">
									Sign in with Google to verify your email before filling the form.
								</p>

								{/* Google button wrapper */}
								<div className="relative">
									<div className="absolute -inset-px bg-gradient-to-r from-blue-400 via-indigo-400 to-blue-400 rounded-2xl opacity-40 blur-sm pointer-events-none" />
									<div className="relative bg-white rounded-2xl border border-gray-100 shadow-lg p-5 flex flex-col items-center gap-3">
										<div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-widest">
											<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
												<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
												<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
												<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
											</svg>
											Secure sign-in
										</div>
										<div id="google-signin-btn" className="flex justify-center w-full" />
										{!gsiReady && (
											process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
												<Button variant="outline" disabled className="w-full h-11 rounded-xl">
													<Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting to Google...
												</Button>
											) : (
												<p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-center w-full">
													Add <strong>NEXT_PUBLIC_GOOGLE_CLIENT_ID</strong> to .env.local and restart.
												</p>
											)
										)}
										<p className="text-xs text-gray-400 text-center">
											Your Google email will be used as your examiner contact.
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Step 2 — Form (only after Google verification) */}
					{googleVerified ? (
						<>
							{/* Section 1: Personal Information */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<User className="w-4 h-4 text-blue-600" /> Personal Information
									</h3>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* Salutation */}
										<div className="space-y-1.5">
											<Label className="text-sm">
												Salutation <span className="text-red-500">*</span>
											</Label>
											<Select value={formData.salutation} onValueChange={(v) => setFormData({ ...formData, salutation: v })}>
												<SelectTrigger className={`h-11 text-base ${errors.salutation ? 'border-red-500' : ''}`}>
													<SelectValue placeholder="Select" />
												</SelectTrigger>
												<SelectContent>
													{(formConfig?.salutations || ['Dr.', 'Mr.', 'Mrs.', 'Ms.']).map(s => (
														<SelectItem key={s} value={s}>{s}</SelectItem>
													))}
												</SelectContent>
											</Select>
											{errors.salutation && <p className="text-xs text-red-500 mt-1">{errors.salutation}</p>}
										</div>

										{/* Gender */}
										<div className="space-y-1.5">
											<Label className="text-sm">
												Gender <span className="text-red-500">*</span>
											</Label>
											<Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
												<SelectTrigger className={`h-11 text-base ${errors.gender ? 'border-red-500' : ''}`}>
													<SelectValue placeholder="Select" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="Male">Male</SelectItem>
													<SelectItem value="Female">Female</SelectItem>
												</SelectContent>
											</Select>
											{errors.gender && <p className="text-xs text-red-500 mt-1">{errors.gender}</p>}
										</div>
									</div>

									{/* Full Name */}
									<div className="space-y-1.5">
										<Label htmlFor="full_name" className="text-sm">
											Full Name (UPPERCASE) <span className="text-red-500">*</span>
										</Label>
										<Input
											id="full_name"
											value={formData.full_name}
											onChange={(e) => setFormData({ ...formData, full_name: e.target.value.toUpperCase() })}
											placeholder="Enter your full name in UPPERCASE"
											className={`text-base h-11 ${errors.full_name ? 'border-red-500' : ''}`}
										/>
										{errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* Designation */}
										<div className="space-y-1.5">
											<Label className="text-sm">
												Designation <span className="text-red-500">*</span>
											</Label>
											<Select value={formData.designation} onValueChange={(v) => setFormData({ ...formData, designation: v, designation_other: v === 'Other' ? formData.designation_other : '' })}>
												<SelectTrigger className={`h-11 text-base ${errors.designation ? 'border-red-500' : ''}`}>
													<SelectValue placeholder="Select designation" />
												</SelectTrigger>
												<SelectContent>
													{(formConfig?.designations || ['Professor', 'Associate Professor', 'Assistant Professor']).map(d => (
														<SelectItem key={d} value={d}>{d}</SelectItem>
													))}
													<SelectItem value="Other">Other</SelectItem>
												</SelectContent>
											</Select>
											{formData.designation === 'Other' && (
												<Input
													value={formData.designation_other}
													onChange={(e) => setFormData({ ...formData, designation_other: e.target.value })}
													placeholder="Specify designation"
													className="text-base h-11 mt-2"
												/>
											)}
											{errors.designation && <p className="text-xs text-red-500 mt-1">{errors.designation}</p>}
										</div>

										{/* Highest Qualification */}
										<div className="space-y-1.5">
											<Label htmlFor="highest_qualification" className="text-sm">
												Highest Qualification <span className="text-red-500">*</span>
											</Label>
											<Input
												id="highest_qualification"
												value={formData.highest_qualification}
												onChange={(e) => setFormData({ ...formData, highest_qualification: e.target.value })}
												placeholder="e.g., Ph.D, M.E., M.Tech"
												className={`text-base h-11 ${errors.highest_qualification ? 'border-red-500' : ''}`}
											/>
											{errors.highest_qualification && <p className="text-xs text-red-500 mt-1">{errors.highest_qualification}</p>}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Section 2: Contact Details */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<Phone className="w-4 h-4 text-blue-600" /> Contact Details
									</h3>

									{/* Google email — locked */}
									<div className="space-y-1.5">
										<Label className="text-sm">Google Verified E-mail</Label>
										<div className="relative">
											<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
											<Input
												value={googleUser?.email || ''}
												readOnly
												className="pl-10 pr-28 bg-blue-50 border-blue-200 text-blue-800 text-base cursor-not-allowed"
											/>
											<span className="absolute right-2 top-1/2 -translate-y-1/2">
												<Badge className="bg-blue-600 text-white border-0 text-xs whitespace-nowrap">
													<ShieldCheck className="w-3 h-3 mr-1" />Google Verified
												</Badge>
											</span>
										</div>
									</div>

									{/* Mobile */}
									<div className="space-y-1.5">
										<Label htmlFor="mobile" className="text-sm">
											Mobile Number <span className="text-red-500">*</span>
										</Label>
										<div className="relative">
											<Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
											<Input
												id="mobile"
												type="tel"
												inputMode="numeric"
												value={formData.mobile}
												onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
												placeholder="10-digit mobile number"
												className={`pl-10 text-base h-11 ${errors.mobile ? 'border-red-500' : ''}`}
											/>
										</div>
										{errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>}
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* Personal Email */}
										<div className="space-y-1.5">
											<Label htmlFor="personal_email" className="text-sm">
												Personal Email <span className="text-red-500">*</span>
											</Label>
											<Input
												id="personal_email"
												type="email"
												value={formData.personal_email}
												onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
												placeholder="your@email.com"
												className={`text-base h-11 ${errors.personal_email ? 'border-red-500' : ''}`}
											/>
											{errors.personal_email && <p className="text-xs text-red-500 mt-1">{errors.personal_email}</p>}
										</div>

										{/* Official Email */}
										<div className="space-y-1.5">
											<Label htmlFor="official_email" className="text-sm">
												Official Email <span className="text-red-500">*</span>
											</Label>
											<Input
												id="official_email"
												type="email"
												value={formData.official_email}
												onChange={(e) => setFormData({ ...formData, official_email: e.target.value })}
												placeholder="official@institution.edu"
												className={`text-base h-11 ${errors.official_email ? 'border-red-500' : ''}`}
											/>
											{errors.official_email && <p className="text-xs text-red-500 mt-1">{errors.official_email}</p>}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Section 3: Institutional Details */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<Building2 className="w-4 h-4 text-blue-600" /> Institutional Details
									</h3>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* AICTE/AU Faculty Code */}
										<div className="space-y-1.5">
											<Label htmlFor="aicte_faculty_code" className="text-sm">
												AICTE/AU Faculty Code <span className="text-red-500">*</span>
											</Label>
											<Input
												id="aicte_faculty_code"
												value={formData.aicte_faculty_code}
												onChange={(e) => setFormData({ ...formData, aicte_faculty_code: e.target.value })}
												placeholder="Faculty code"
												className={`text-base h-11 ${errors.aicte_faculty_code ? 'border-red-500' : ''}`}
											/>
											{errors.aicte_faculty_code && <p className="text-xs text-red-500 mt-1">{errors.aicte_faculty_code}</p>}
										</div>

										{/* Working Institution */}
										<div className="space-y-1.5">
											<Label htmlFor="institution_name" className="text-sm">
												Working Institution <span className="text-red-500">*</span>
											</Label>
											<Input
												id="institution_name"
												value={formData.institution_name}
												onChange={(e) => setFormData({ ...formData, institution_name: e.target.value })}
												placeholder="Your institution name"
												className={`text-base h-11 ${errors.institution_name ? 'border-red-500' : ''}`}
											/>
											{errors.institution_name && <p className="text-xs text-red-500 mt-1">{errors.institution_name}</p>}
										</div>
									</div>

									{/* Address & Pincode */}
									<div className="space-y-1.5">
										<Label htmlFor="address_pincode" className="text-sm">
											Address &amp; Pincode <span className="text-red-500">*</span>
										</Label>
										<Textarea
											id="address_pincode"
											value={formData.address_pincode}
											onChange={(e) => setFormData({ ...formData, address_pincode: e.target.value })}
											placeholder="Full address with city, state and pincode"
											rows={3}
											className={`text-base ${errors.address_pincode ? 'border-red-500' : ''}`}
										/>
										{errors.address_pincode && <p className="text-xs text-red-500 mt-1">{errors.address_pincode}</p>}
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* Institution COE Contact */}
										<div className="space-y-1.5">
											<Label htmlFor="institution_coe_contact" className="text-sm">
												Institution COE Contact Number <span className="text-red-500">*</span>
											</Label>
											<Input
												id="institution_coe_contact"
												type="tel"
												inputMode="numeric"
												value={formData.institution_coe_contact}
												onChange={(e) => setFormData({ ...formData, institution_coe_contact: e.target.value })}
												placeholder="COE contact number"
												className={`text-base h-11 ${errors.institution_coe_contact ? 'border-red-500' : ''}`}
											/>
											{errors.institution_coe_contact && <p className="text-xs text-red-500 mt-1">{errors.institution_coe_contact}</p>}
										</div>

										{/* Institution COE Email */}
										<div className="space-y-1.5">
											<Label htmlFor="institution_coe_email" className="text-sm">
												Institution COE Email <span className="text-red-500">*</span>
											</Label>
											<Input
												id="institution_coe_email"
												type="email"
												value={formData.institution_coe_email}
												onChange={(e) => setFormData({ ...formData, institution_coe_email: e.target.value })}
												placeholder="coe@institution.edu"
												className={`text-base h-11 ${errors.institution_coe_email ? 'border-red-500' : ''}`}
											/>
											{errors.institution_coe_email && <p className="text-xs text-red-500 mt-1">{errors.institution_coe_email}</p>}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Section 4: Experience */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<Briefcase className="w-4 h-4 text-blue-600" /> Experience
									</h3>

									<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
										{/* Teaching Experience */}
										<div className="space-y-1.5">
											<Label htmlFor="teaching_exp_years" className="text-sm">
												Teaching Exp. in Engg. Colleges <span className="text-red-500">*</span>
											</Label>
											<Input
												id="teaching_exp_years"
												type="number"
												inputMode="numeric"
												min="0"
												value={formData.teaching_exp_years}
												onChange={(e) => setFormData({ ...formData, teaching_exp_years: e.target.value })}
												placeholder="Years"
												className={`text-base h-11 ${errors.teaching_exp_years ? 'border-red-500' : ''}`}
											/>
											{errors.teaching_exp_years && <p className="text-xs text-red-500 mt-1">{errors.teaching_exp_years}</p>}
										</div>

										{/* Industry Experience */}
										<div className="space-y-1.5">
											<Label htmlFor="industry_exp_years" className="text-sm">
												Industry Experience
											</Label>
											<Input
												id="industry_exp_years"
												type="number"
												inputMode="numeric"
												min="0"
												value={formData.industry_exp_years}
												onChange={(e) => setFormData({ ...formData, industry_exp_years: e.target.value })}
												placeholder="Years (optional)"
												className="text-base h-11"
											/>
										</div>

										{/* Total Experience */}
										<div className="space-y-1.5">
											<Label htmlFor="total_exp_years" className="text-sm">
												Total Experience <span className="text-red-500">*</span>
											</Label>
											<Input
												id="total_exp_years"
												type="number"
												inputMode="numeric"
												min="0"
												value={formData.total_exp_years}
												onChange={(e) => setFormData({ ...formData, total_exp_years: e.target.value })}
												placeholder="Years"
												className={`text-base h-11 ${errors.total_exp_years ? 'border-red-500' : ''}`}
											/>
											{errors.total_exp_years && <p className="text-xs text-red-500 mt-1">{errors.total_exp_years}</p>}
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Section 5: Academic Profile */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<GraduationCap className="w-4 h-4 text-blue-600" /> Academic Profile
									</h3>

									{/* Department */}
									<div className="space-y-1.5">
										<Label className="text-sm">
											Department <span className="text-red-500">*</span>
										</Label>
										<Select value={formData.department} onValueChange={(v) => setFormData({ ...formData, department: v, department_other: v === 'Other' ? formData.department_other : '' })}>
											<SelectTrigger className={`h-11 text-base ${errors.department ? 'border-red-500' : ''}`}>
												<SelectValue placeholder="Select department" />
											</SelectTrigger>
											<SelectContent>
												{(formConfig?.departments || ['Computer Science and Engineering', 'Electronics and Communication Engineering', 'Electrical and Electronics Engineering', 'Mechanical Engineering', 'Civil Engineering', 'Information Technology', 'MBA']).map(d => (
													<SelectItem key={d} value={d}>{d}</SelectItem>
												))}
												<SelectItem value="Other">Other</SelectItem>
											</SelectContent>
										</Select>
										{formData.department === 'Other' && (
											<Input
												value={formData.department_other}
												onChange={(e) => setFormData({ ...formData, department_other: e.target.value })}
												placeholder="Specify department"
												className="text-base h-11 mt-2"
											/>
										)}
										{errors.department && <p className="text-xs text-red-500 mt-1">{errors.department}</p>}
									</div>

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
										{/* UG Specialization */}
										<div className="space-y-1.5">
											<Label htmlFor="ug_specialization" className="text-sm">
												UG Specialization <span className="text-red-500">*</span>
											</Label>
											<Input
												id="ug_specialization"
												value={formData.ug_specialization}
												onChange={(e) => setFormData({ ...formData, ug_specialization: e.target.value })}
												placeholder="e.g., Computer Science"
												className={`text-base h-11 ${errors.ug_specialization ? 'border-red-500' : ''}`}
											/>
											{errors.ug_specialization && <p className="text-xs text-red-500 mt-1">{errors.ug_specialization}</p>}
										</div>

										{/* PG Specialization */}
										<div className="space-y-1.5">
											<Label htmlFor="pg_specialization" className="text-sm">
												PG Specialization <span className="text-red-500">*</span>
											</Label>
											<Input
												id="pg_specialization"
												value={formData.pg_specialization}
												onChange={(e) => setFormData({ ...formData, pg_specialization: e.target.value })}
												placeholder="e.g., Software Engineering"
												className={`text-base h-11 ${errors.pg_specialization ? 'border-red-500' : ''}`}
											/>
											{errors.pg_specialization && <p className="text-xs text-red-500 mt-1">{errors.pg_specialization}</p>}
										</div>
									</div>

									{/* PhD Specialization */}
									<div className="space-y-1.5">
										<Label htmlFor="phd_specialization" className="text-sm">
											PhD Specialization
										</Label>
										<Textarea
											id="phd_specialization"
											value={formData.phd_specialization}
											onChange={(e) => setFormData({ ...formData, phd_specialization: e.target.value })}
											placeholder="Describe your PhD specialization area"
											rows={2}
											className="text-base"
										/>
									</div>

									{/* Area of Expertise */}
									<div className="space-y-1.5">
										<Label htmlFor="area_of_expertise" className="text-sm">
											Area of Expertise
										</Label>
										<Input
											id="area_of_expertise"
											value={formData.area_of_expertise}
											onChange={(e) => setFormData({ ...formData, area_of_expertise: e.target.value })}
											placeholder="e.g., Machine Learning, Data Structures"
											className="text-base h-11"
										/>
									</div>
								</CardContent>
							</Card>

							{/* Section 6: Examiner Preferences */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-3">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<ClipboardCheck className="w-4 h-4 text-blue-600" /> Examiner Preferences
									</h3>
									<p className="text-xs text-gray-500">Select the roles you are willing to serve as:</p>

									{(formConfig?.willingness_roles || ['Theory Valuation', 'Practical Examination', 'Scrutiny', 'Chief Examiner', 'External Examiner']).map(role => (
										<label key={role} htmlFor={`role-${role}`} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-pointer active:bg-gray-100">
											<Checkbox
												id={`role-${role}`}
												checked={formData.willingness_roles.includes(role)}
												onCheckedChange={(checked) => {
													setFormData(prev => ({
														...prev,
														willingness_roles: checked
															? [...prev.willingness_roles, role]
															: prev.willingness_roles.filter(r => r !== role),
													}))
												}}
												className="mt-0.5"
											/>
											<span className="text-sm text-gray-800 select-none">{role}</span>
										</label>
									))}
									{errors.willingness_roles && <p className="text-xs text-red-500 mt-1">{errors.willingness_roles}</p>}
								</CardContent>
							</Card>

							{/* Section 7: Courses Handled */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<BookOpen className="w-4 h-4 text-blue-600" /> Courses Handled
									</h3>
									<p className="text-xs text-gray-500">Courses handled more than 3 times</p>

									{/* Theory Courses */}
									<div className="space-y-3">
										<p className="text-sm font-medium text-gray-700">Theory Courses <span className="text-red-500">*</span></p>
										{formData.theory_courses.map((tc, i) => (
											<Input
												key={i}
												value={tc.course}
												onChange={(e) => updateTheoryCourse(i, e.target.value)}
												placeholder={`Theory Courses ${i + 1}`}
												className="text-base h-11"
											/>
										))}
										{errors.theory_courses && <p className="text-xs text-red-500 mt-1">{errors.theory_courses}</p>}
									</div>

									{/* Practical Courses */}
									<div className="space-y-3">
										<p className="text-sm font-medium text-gray-700">Practical Courses <span className="text-red-500">*</span></p>
										{formData.practical_courses.map((pc, i) => (
											<Input
												key={i}
												value={pc.course}
												onChange={(e) => updatePracticalCourse(i, e.target.value)}
												placeholder={`Practical Courses ${i + 1}`}
												className="text-base h-11"
											/>
										))}
										{errors.practical_courses && <p className="text-xs text-red-500 mt-1">{errors.practical_courses}</p>}
									</div>
								</CardContent>
							</Card>

							{/* Section 8: Declaration & Submit */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
										<FileText className="w-4 h-4 text-blue-600" /> Declaration
									</h3>

									<label htmlFor="declaration" className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50 cursor-pointer">
										<Checkbox
											id="declaration"
											checked={formData.declaration_acknowledged}
											onCheckedChange={(checked) => setFormData({ ...formData, declaration_acknowledged: checked as boolean })}
											className="mt-0.5"
										/>
										<span className="text-sm text-gray-700 leading-relaxed select-none">
											I hereby declare that all the information provided above is true and correct to the best of my knowledge.
											I am willing to serve as an external examiner for J.K.K. Nattraja College of Engineering &amp; Technology and agree to abide by the
											rules and regulations of the institution and Anna University.
										</span>
									</label>
									{errors.declaration && <p className="text-xs text-red-500 mt-1">{errors.declaration}</p>}
								</CardContent>
							</Card>
						</>
					) : (
						<div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
							<AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
							<span>Please verify your identity with Google above to access the registration form.</span>
						</div>
					)}
				</div>

				{/* ── Sticky Submit Button (only after Google verification) ── */}
				{googleVerified && (
					<div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3 shadow-lg">
						<div className="max-w-3xl mx-auto">
							<Button
								onClick={handleSubmit}
								disabled={submitting || !formData.declaration_acknowledged}
								className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white h-12 text-base font-semibold rounded-xl disabled:opacity-50"
							>
								{submitting ? (
									<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Submitting...</>
								) : (
									<><Send className="w-5 h-5 mr-2" />Submit Registration<ChevronRight className="w-4 h-4 ml-1" /></>
								)}
							</Button>
							<p className="text-center text-xs text-gray-400 mt-2">
								By submitting, you agree to be contacted for examination-related work.
							</p>
						</div>
					</div>
				)}

			</div>
		</>
	)
}
