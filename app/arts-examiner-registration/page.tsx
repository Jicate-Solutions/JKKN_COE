'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Script from 'next/script'
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
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────

// CAS = J.K.K. Nataraja College of Arts & Science
const INSTITUTION_CODE = 'CAS'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Board {
	id: string
	board_code: string
	board_name: string
	board_type?: string
	display_name?: string
}

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

export default function ArtsExaminerRegistrationPage() {
	const { toast } = useToast()

	// Google sign-in
	const [googleVerified, setGoogleVerified] = useState(false)
	const [googleUser, setGoogleUser] = useState<GooglePayload | null>(null)
	const [gsiReady, setGsiReady] = useState(false)

	// Form
	const [formData, setFormData] = useState({
		full_name: '',
		email: '',
		mobile: '',
		designation: '',
		department: '',
		institution_name: '',
		institution_address: '',
		ug_experience_years: '',
		pg_experience_years: '',
		ug_board_code: 'None',
		ug_board_id: '',
		pg_board_code: 'None',
		pg_board_id: '',
		willing_for_valuation: true,
		willing_for_practical: false,
		willing_for_scrutiny: false,
	})

	// Existing registration view mode
	const [checkingStatus, setCheckingStatus] = useState(false)
	const [existingRegistration, setExistingRegistration] = useState<{
		examiner: Record<string, unknown>
		boards: Array<{ board_code: string; willing_for_valuation: boolean; willing_for_practical: boolean; willing_for_scrutiny: boolean; board: { board_name: string; board_type: string } }>
	} | null>(null)

	const [boards, setBoards] = useState<Board[]>([])
	const [loading, setLoading] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [submitted, setSubmitted] = useState(false)
	const [alreadySubmitted, setAlreadySubmitted] = useState<'PENDING' | 'ACTIVE' | 'REJECTED' | null>(null)
	const [errors, setErrors] = useState<Record<string, string>>({})

	useEffect(() => {
		const fetchBoards = async () => {
			try {
				setLoading(true)
				const res = await fetch('/api/public/boards')
				if (res.ok) setBoards(await res.json())
			} catch (e) {
				console.error('Error fetching boards:', e)
			} finally {
				setLoading(false)
			}
		}
		fetchBoards()
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
				email: payload.email,
				full_name: prev.full_name,
			}))

			// Check if this email is already registered
			setCheckingStatus(true)
			try {
				const res = await fetch(`/api/public/examiner/status?email=${encodeURIComponent(payload.email)}`)
				const data = await res.json()
				if (data.exists) {
					setExistingRegistration({ examiner: data.examiner, boards: data.boards || [] })
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
		if (!formData.full_name.trim()) e.full_name = 'Name is required'
		if (!formData.mobile.trim()) e.mobile = 'Mobile number is required'
		if (formData.mobile && !/^[0-9]{10}$/.test(formData.mobile.replace(/\s/g, '')))
			e.mobile = 'Enter a valid 10-digit mobile number'
		if (!formData.designation.trim()) e.designation = 'Designation is required'
		if (!formData.institution_name.trim()) e.institution_name = 'Institution name is required'
		if (!formData.institution_address.trim()) e.institution_address = 'Institution address is required'
		if (formData.ug_board_code === 'None' && formData.pg_board_code === 'None')
			e.ug_board_code = 'Select at least one board (UG or PG)'
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
					institution_code: INSTITUTION_CODE,
					google_verified: googleVerified,
					email_verified: googleVerified,
				}),
			})
			const data = await res.json()
			if (!res.ok) {
				// Handle already-registered cases gracefully
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

	const ugBoards = boards.filter(b => b.board_type === 'UG' || b.board_code === 'None')
		.sort((a, b) => a.board_code === 'None' ? -1 : b.board_code === 'None' ? 1 : (a.board_name || '').localeCompare(b.board_name || ''))
	const pgBoards = boards.filter(b => b.board_type === 'PG' || b.board_code === 'None')
		.sort((a, b) => a.board_code === 'None' ? -1 : b.board_code === 'None' ? 1 : (a.board_name || '').localeCompare(b.board_name || ''))

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
				icon: <CheckCircle2 className="w-10 h-10 text-emerald-600" />,
				bg: 'from-emerald-50 to-white',
				iconBg: 'bg-emerald-100',
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
					<Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
					<p className="text-sm text-gray-500">Checking your registration status…</p>
				</div>
			</div>
		)
	}

	// ── Existing Registration View / Edit Mode ───────────────────────────────

	if (existingRegistration) {
		const ex = existingRegistration.examiner as Record<string, unknown>
		const isEditable = ex.is_enable === true
		const statusConfig: Record<string, { label: string; className: string }> = {
			PENDING:  { label: 'Pending Approval', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
			ACTIVE:   { label: 'Active',            className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
			INACTIVE: { label: 'Inactive',           className: 'bg-gray-100 text-gray-600 border-gray-200' },
			REJECTED: { label: 'Rejected',           className: 'bg-red-100 text-red-700 border-red-200' },
		}
		const statusStyle = statusConfig[ex.status as string] ?? statusConfig['PENDING']

		const Field = ({ label, value }: { label: string; value?: unknown }) => (
			<div className="space-y-1">
				<p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
				<p className="text-sm text-gray-900">{String(value || '—')}</p>
			</div>
		)

		return (
			<div className="min-h-screen bg-gray-50">
				{/* Premium Institution Header */}
				<div className="bg-white shadow-sm">
					<div className="h-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600" />
					<div className="max-w-2xl mx-auto px-4 py-4">
						<div className="flex items-center gap-3">
							<Image src="/jkkn_logo.png" alt="JKKN" width={56} height={56} className="object-contain flex-shrink-0" />
							<div className="flex-1 text-center min-w-0">
								<h1 className="text-sm font-extrabold text-gray-900 leading-tight tracking-wide uppercase">
									J.K.K. Nataraja College of Arts &amp; Science
								</h1>
								<p className="text-[10px] font-semibold text-emerald-700 mt-0.5 tracking-wider">(AUTONOMOUS)</p>
								<p className="text-[9px] text-gray-500 mt-0.5 leading-tight">
									Accredited by NAAC · Recognized by UGC under 2(f) &amp; 12(B) · Affiliated to Periyar University
								</p>
								<p className="text-[9px] text-gray-400 mt-0.5">Komarapalayam – 638 183, Namakkal Dist., Tamil Nadu</p>
							</div>
							<Image src="/jkkncas_logo.png" alt="CAS" width={52} height={52} className="object-contain flex-shrink-0" />
						</div>
					</div>
				</div>
				<div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white shadow-lg">
					<div className="max-w-2xl mx-auto px-4 py-4 text-center">
						<h2 className="text-base font-bold tracking-widest uppercase">Panel of Examiners Registration</h2>
						<p className="text-emerald-200 text-xs mt-1 tracking-wide">Registration Details</p>
					</div>
				</div>

				{/* Content */}
				<div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-8">

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
								<User className="w-4 h-4 text-emerald-600" /> Personal Information
							</h3>
							<div className="grid grid-cols-1 gap-4">
								<div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
									<p className="text-xs text-emerald-600 font-medium">E-mail (Google Verified)</p>
									<p className="text-sm font-semibold text-emerald-900 mt-0.5">{String(ex.email)}</p>
								</div>
								<div className="grid grid-cols-2 gap-4">
									<Field label="Full Name" value={ex.full_name} />
									<Field label="Mobile" value={ex.mobile} />
								</div>
								<div className="grid grid-cols-2 gap-4">
									<Field label="Designation" value={ex.designation} />
									<Field label="Department" value={ex.department} />
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Institution */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<Building2 className="w-4 h-4 text-emerald-600" /> Institution Details
							</h3>
							<Field label="Institution Name" value={ex.institution_name} />
							<Field label="Institution Address" value={ex.institution_address} />
						</CardContent>
					</Card>

					{/* Boards */}
					<Card className="border-0 shadow-sm">
						<CardContent className="p-5 space-y-4">
							<h3 className="font-semibold text-gray-900 flex items-center gap-2">
								<GraduationCap className="w-4 h-4 text-emerald-600" /> Board &amp; Experience
							</h3>
							<div className="grid grid-cols-2 gap-4">
								<Field label="UG Experience" value={`${ex.ug_experience_years ?? 0} years`} />
								<Field label="PG Experience" value={`${ex.pg_experience_years ?? 0} years`} />
							</div>
							{existingRegistration.boards.length > 0 ? (
								<div className="space-y-2">
									{existingRegistration.boards.map((b, i) => (
										<div key={i} className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
											<div className="flex items-center justify-between">
												<p className="text-sm font-medium text-gray-900">{b.board?.board_name || b.board_code}</p>
												<Badge variant="outline" className="text-xs">{b.board?.board_type || 'UG'}</Badge>
											</div>
											<div className="flex gap-3 mt-2 text-xs text-gray-500">
												{b.willing_for_valuation && <span className="text-emerald-600">✓ Valuation</span>}
												{b.willing_for_practical && <span className="text-emerald-600">✓ Practical</span>}
												{b.willing_for_scrutiny && <span className="text-emerald-600">✓ Scrutiny</span>}
											</div>
										</div>
									))}
								</div>
							) : (
								<p className="text-sm text-gray-400">No board associations</p>
							)}
						</CardContent>
					</Card>

					{isEditable && (
						<Button
							onClick={() => setExistingRegistration(null)}
							className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base font-semibold rounded-xl"
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
			<div className="min-h-screen bg-gradient-to-br from-emerald-50 to-white flex items-center justify-center p-4">
				<div className="w-full max-w-sm text-center space-y-6 py-12">
					<div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
						<CheckCircle2 className="w-10 h-10 text-emerald-600" />
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
			<Script src="https://accounts.google.com/gsi/client" onLoad={initGoogleSignIn} strategy="afterInteractive" />

			<div className="min-h-screen bg-gray-50">

				{/* ── Premium Institution Header ── */}
				<div className="bg-white shadow-sm sticky top-0 z-10">
					<div className="h-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-600" />
					<div className="max-w-2xl mx-auto px-3 py-3 sm:px-4 sm:py-4">
						<div className="flex items-center gap-2 sm:gap-3">
							<Image src="/jkkn_logo.png" alt="JKKN" width={52} height={52} className="object-contain flex-shrink-0 w-11 h-11 sm:w-14 sm:h-14" />
							<div className="flex-1 text-center min-w-0">
								<h1 className="text-xs sm:text-sm font-extrabold text-gray-900 leading-tight tracking-wide uppercase">
									J.K.K. Nataraja College of Arts &amp; Science
								</h1>
								<p className="text-[9px] sm:text-[10px] font-semibold text-emerald-700 mt-0.5 tracking-wider">(AUTONOMOUS)</p>
								<p className="hidden sm:block text-[9px] text-gray-500 mt-0.5 leading-tight">
									Accredited by NAAC · Recognized by UGC under 2(f) &amp; 12(B) · Affiliated to Periyar University
								</p>
								<p className="sm:hidden text-[8px] text-gray-500 mt-0.5 leading-tight">Affiliated to Periyar University</p>
								<p className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5">Komarapalayam – 638 183, Namakkal Dist., Tamil Nadu</p>
							</div>
							<Image src="/jkkncas_logo.png" alt="CAS" width={48} height={48} className="object-contain flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12" />
						</div>
					</div>
				</div>

				{/* ── Premium Title Banner ── */}
				<div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-700 text-white shadow-lg">
					<div className="max-w-2xl mx-auto px-4 py-4 sm:py-5 text-center">
						<h2 className="text-sm sm:text-base font-bold tracking-widest uppercase">Panel of Examiners Registration</h2>
						<p className="text-emerald-200 text-xs mt-1 tracking-wide">Theory Examinations · Practical Examinations · Valuation</p>
					</div>
				</div>

				{/* ── Content ── */}
				<div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-24">

					{/* Step 1 — Google Verification */}
					<Card className="border-0 shadow-sm overflow-hidden">
						<CardContent className="p-5">
							<div className="flex items-center gap-2 mb-4">
								<div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
								<h3 className="font-semibold text-gray-900">Verify Your Identity</h3>
								{googleVerified && (
									<Badge className="ml-auto bg-emerald-100 text-emerald-700 border-emerald-200 text-xs flex-shrink-0">
										<CheckCircle2 className="w-3 h-3 mr-1" />Verified
									</Badge>
								)}
							</div>

							{/* Verified profile card */}
							{googleVerified && googleUser && (
								<div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-3 overflow-hidden">
									{googleUser.picture && (
										// eslint-disable-next-line @next/next/no-img-element
										<img src={googleUser.picture} alt="" width={40} height={40} className="rounded-full flex-shrink-0 w-10 h-10" />
									)}
									<div className="flex-1 min-w-0 overflow-hidden">
										<p className="font-semibold text-emerald-900 text-sm truncate leading-tight">{googleUser.name}</p>
										<p className="text-xs text-emerald-700 truncate leading-tight mt-0.5">{googleUser.email}</p>
									</div>
									<ShieldCheck className="w-5 h-5 text-emerald-600 flex-shrink-0" />
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

								{/* Premium Google button wrapper */}
								<div className="relative">
									{/* Ambient glow */}
									<div className="absolute -inset-px bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 rounded-2xl opacity-40 blur-sm pointer-events-none" />
									<div className="relative bg-white rounded-2xl border border-gray-100 shadow-lg p-5 flex flex-col items-center gap-3">
										{/* Google logo + label */}
										<div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-widest">
											<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
												<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
												<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
												<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
												<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
											</svg>
											Secure sign-in
										</div>
										{/* GSI renders here */}
										<div id="google-signin-btn" className="flex justify-center w-full" />
										{!gsiReady && (
											process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
												<Button variant="outline" disabled className="w-full h-11 rounded-xl">
													<Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting to Google...
												</Button>
											) : (
												<p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 text-center w-full">
													⚠️ Add <strong>NEXT_PUBLIC_GOOGLE_CLIENT_ID</strong> to .env.local and restart.
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
							{/* Personal Info */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<div className="flex items-center gap-2 mb-1">
										<div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
										<h3 className="font-semibold text-gray-900 flex items-center gap-2">
											<User className="w-4 h-4 text-emerald-600" /> Personal Information
										</h3>
									</div>

									{/* Email — locked */}
									<div className="space-y-1.5">
										<Label className="text-sm">E-mail ID</Label>
										<div className="relative">
											<Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
											<Input
												value={formData.email}
												readOnly
												className="pl-10 pr-28 bg-emerald-50 border-emerald-200 text-emerald-800 text-base cursor-not-allowed"
											/>
											<span className="absolute right-2 top-1/2 -translate-y-1/2">
												<Badge className="bg-emerald-600 text-white border-0 text-xs whitespace-nowrap">
													<ShieldCheck className="w-3 h-3 mr-1" />Google Verified
												</Badge>
											</span>
										</div>
									</div>

									{/* Name */}
									<div className="space-y-1.5">
										<Label htmlFor="full_name" className="text-sm">
											Full Name <span className="text-red-500">*</span>
										</Label>
										<Input
											id="full_name"
											value={formData.full_name}
											onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
											placeholder="Enter your full name"
											className={`text-base h-11 ${errors.full_name ? 'border-red-500' : ''}`}
										/>
										{errors.full_name && <p className="text-xs text-red-500">{errors.full_name}</p>}
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
										{errors.mobile && <p className="text-xs text-red-500">{errors.mobile}</p>}
									</div>

									{/* Designation */}
									<div className="space-y-1.5">
										<Label htmlFor="designation" className="text-sm">
											Designation <span className="text-red-500">*</span>
										</Label>
										<Input
											id="designation"
											value={formData.designation}
											onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
											placeholder="e.g., Assistant Professor"
											className={`text-base h-11 ${errors.designation ? 'border-red-500' : ''}`}
										/>
										{errors.designation && <p className="text-xs text-red-500">{errors.designation}</p>}
									</div>
								</CardContent>
							</Card>

							{/* Institution Info */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2">
										<Building2 className="w-4 h-4 text-emerald-600" /> Institution Details
									</h3>

									<div className="space-y-1.5">
										<Label htmlFor="institution_name" className="text-sm">
											Institution Name <span className="text-red-500">*</span>
										</Label>
										<Input
											id="institution_name"
											value={formData.institution_name}
											onChange={(e) => setFormData({ ...formData, institution_name: e.target.value })}
											placeholder="Your institution name"
											className={`text-base h-11 ${errors.institution_name ? 'border-red-500' : ''}`}
										/>
										{errors.institution_name && <p className="text-xs text-red-500">{errors.institution_name}</p>}
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="institution_address" className="text-sm">
											Institution Address <span className="text-red-500">*</span>
										</Label>
										<Textarea
											id="institution_address"
											value={formData.institution_address}
											onChange={(e) => setFormData({ ...formData, institution_address: e.target.value })}
											placeholder="Full address with city, state and pincode"
											rows={3}
											className={`text-base ${errors.institution_address ? 'border-red-500' : ''}`}
										/>
										{errors.institution_address && <p className="text-xs text-red-500">{errors.institution_address}</p>}
									</div>

									<div className="space-y-1.5">
										<Label htmlFor="department" className="text-sm">Department / Subject</Label>
										<Input
											id="department"
											value={formData.department}
											onChange={(e) => setFormData({ ...formData, department: e.target.value })}
											placeholder="e.g., Department of Computer Science"
											className="text-base h-11"
										/>
									</div>
								</CardContent>
							</Card>

							{/* Board & Experience */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-4">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2">
										<GraduationCap className="w-4 h-4 text-emerald-600" /> Board &amp; Experience
									</h3>

									<div className="space-y-1.5">
										<Label className="text-sm">
											UG Board <span className="text-red-500">*</span>
										</Label>
										<Select value={formData.ug_board_code} onValueChange={(v) => {
												const b = ugBoards.find(x => x.board_code === v)
												setFormData({ ...formData, ug_board_code: v, ug_board_id: b && b.id !== 'none' ? b.id : '', ...(v === 'None' ? { ug_experience_years: '' } : {}) })
											}}>
											<SelectTrigger className={`h-11 text-base ${errors.ug_board_code ? 'border-red-500' : ''}`}>
												<SelectValue placeholder="Select UG Board" />
											</SelectTrigger>
											<SelectContent>
												{ugBoards.map(b => <SelectItem key={b.id} value={b.board_code}>{b.display_name || b.board_name}</SelectItem>)}
											</SelectContent>
										</Select>
										{errors.ug_board_code && <p className="text-xs text-red-500">{errors.ug_board_code}</p>}
									</div>

									<div className="space-y-1.5">
										<Label className="text-sm">PG Board</Label>
										<Select value={formData.pg_board_code} onValueChange={(v) => {
												const b = pgBoards.find(x => x.board_code === v)
												setFormData({ ...formData, pg_board_code: v, pg_board_id: b && b.id !== 'none' ? b.id : '', ...(v === 'None' ? { pg_experience_years: '' } : {}) })
											}}>
											<SelectTrigger className="h-11 text-base">
												<SelectValue placeholder="Select PG Board" />
											</SelectTrigger>
											<SelectContent>
												{pgBoards.map(b => <SelectItem key={b.id} value={b.board_code}>{b.display_name || b.board_name}</SelectItem>)}
											</SelectContent>
										</Select>
									</div>

									{(formData.ug_board_code !== 'None' || formData.pg_board_code !== 'None') && (
										<div className="grid grid-cols-2 gap-3">
											{formData.ug_board_code !== 'None' && (
												<div className="space-y-1.5">
													<Label className="text-sm">UG Experience (Years)</Label>
													<Input
														type="number"
														inputMode="numeric"
														min="0"
														value={formData.ug_experience_years}
														onChange={(e) => setFormData({ ...formData, ug_experience_years: e.target.value })}
														placeholder="0"
														className="text-base h-11"
													/>
												</div>
											)}
											{formData.pg_board_code !== 'None' && (
												<div className="space-y-1.5">
													<Label className="text-sm">PG Experience (Years)</Label>
													<Input
														type="number"
														inputMode="numeric"
														min="0"
														value={formData.pg_experience_years}
														onChange={(e) => setFormData({ ...formData, pg_experience_years: e.target.value })}
														placeholder="0"
														className="text-base h-11"
													/>
												</div>
											)}
										</div>
									)}
								</CardContent>
							</Card>

							{/* Willingness */}
							<Card className="border-0 shadow-sm">
								<CardContent className="p-5 space-y-3">
									<h3 className="font-semibold text-gray-900 flex items-center gap-2">
										<CheckCircle2 className="w-4 h-4 text-emerald-600" /> Willing to Serve As
									</h3>
									{[
										{ id: 'valuation', label: 'Theory Valuation', key: 'willing_for_valuation' as const },
										{ id: 'practical', label: 'Practical Examination', key: 'willing_for_practical' as const },
										{ id: 'scrutiny', label: 'Scrutiny', key: 'willing_for_scrutiny' as const },
									].map(item => (
										<label key={item.id} htmlFor={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 cursor-pointer active:bg-gray-100">
											<Checkbox
												id={item.id}
												checked={formData[item.key]}
												onCheckedChange={(c) => setFormData({ ...formData, [item.key]: c as boolean })}
												className="mt-0.5"
											/>
											<span className="text-sm text-gray-800 select-none">{item.label}</span>
										</label>
									))}
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
						<div className="max-w-2xl mx-auto">
							<Button
								onClick={handleSubmit}
								disabled={submitting}
								className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white h-12 text-base font-semibold rounded-xl"
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
