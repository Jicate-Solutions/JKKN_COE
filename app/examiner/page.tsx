'use client'

// The common Examiner Portal — question-paper work for every stream.
//
// Three URLs, three jobs:
//   /engg-examiner-registration  Engineering examiner registration (+ portal)
//   /arts-examiner-registration  Arts & Science examiner registration
//   /examiner                    THIS — sign in and do the work, either stream
//
// Nothing here is stream-specific, and that is the point: an examiner, an
// appointment and a question paper are the same records whichever college
// appointed them (`examiners`, `ia_qp_assignments`, `ese_question_papers`).
// Only the REGISTRATION FORM differs between streams — different fields, a
// different institution — so that stays on the two registration URLs and this
// page never duplicates it.
//
// This is also the URL printed on the Examiner Order, because it is short enough
// to read out over the phone.

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Script from 'next/script'
import { useNonce } from '@/components/common/nonce-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, ShieldCheck, GraduationCap, BookOpen, ArrowRight } from 'lucide-react'
import { ExaminerPortal } from '@/components/examiner-portal/portal'
import { PortalOtpSignIn } from '@/components/examiner-portal/portal-otp-signin'

interface PortalExaminer {
	id: string
	full_name: string
	email: string
	kind: 'internal' | 'external'
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

export default function ExaminerPortalPage() {
	const { toast } = useToast()
	const nonce = useNonce()

	const [examiner, setExaminer] = useState<PortalExaminer | null>(null)
	const [checking, setChecking] = useState(true)
	const [gsiReady, setGsiReady] = useState(false)
	/** Set when Google verified an address that has no appointment here. */
	const [unknownEmail, setUnknownEmail] = useState<string | null>(null)

	// ── An existing portal session skips sign-in entirely ────────────────────
	useEffect(() => {
		const check = async () => {
			try {
				const res = await fetch('/api/examiner-portal/session')
				const data = await res.json()
				if (res.ok && data.authenticated) setExaminer(data.examiner)
			} catch {
				// No session — the sign-in card below is the right landing.
			} finally {
				setChecking(false)
			}
		}
		check()
	}, [])

	// ── Google sign-in ───────────────────────────────────────────────────────
	const handleGoogleCredential = useCallback(
		async (response: { credential: string }) => {
			try {
				// Verified SERVER-side (signature, audience, expiry). A browser-side
				// decode must never be what admits someone to a question paper.
				const res = await fetch('/api/examiner-portal/auth/google', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ credential: response.credential }),
				})
				const data = await res.json().catch(() => ({}))

				if (res.ok && data.success) {
					setUnknownEmail(null)
					setExaminer(data.examiner)
					return
				}

				// The address is genuine but carries no appointment. Unlike the
				// registration pages, there is no form here to fall through to — so
				// say so plainly and point at the two places that do register people.
				if (data.email) {
					setUnknownEmail(data.email)
					return
				}
				toast({
					title: 'Sign-in failed',
					description: data.message || 'Please try again.',
					variant: 'destructive',
				})
			} catch {
				toast({
					title: 'Sign-in failed',
					description: 'Could not reach the server. Please try again.',
					variant: 'destructive',
				})
			}
		},
		[toast]
	)

	useEffect(() => {
		if (!gsiReady || examiner || checking) return
		const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
		if (!clientId || !window.google) return
		window.google.accounts.id.initialize({
			client_id: clientId,
			callback: handleGoogleCredential,
			auto_select: false,
		})
		window.google.accounts.id.renderButton(document.getElementById('examiner-google-btn'), {
			theme: 'outline',
			size: 'large',
			width: 320,
			text: 'signin_with',
		})
	}, [gsiReady, examiner, checking, handleGoogleCredential])

	// ── Signed in: the portal is the whole page ──────────────────────────────
	if (examiner) {
		return <ExaminerPortal examiner={examiner} onSignedOut={() => setExaminer(null)} />
	}

	if (checking) {
		return (
			<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
				<div className="text-center space-y-3">
					<Loader2 className="h-7 w-7 animate-spin text-emerald-600 mx-auto" />
					<p className="text-sm text-gray-500">Checking your session…</p>
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-slate-50">
			<Script
				src="https://accounts.google.com/gsi/client"
				strategy="afterInteractive"
				nonce={nonce}
				onLoad={() => setGsiReady(true)}
			/>

			<div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
				{/* Letterhead */}
				<div className="mb-6 flex flex-col items-center text-center">
					<Image src="/logo.png" alt="JKKN" width={120} height={44} className="h-11 w-auto" priority />
					<h1 className="mt-4 text-xl font-semibold tracking-tight text-gray-900">Examiner Portal</h1>
					<p className="mt-1 text-sm text-gray-600">Office of the Controller of Examinations</p>
				</div>

				<Card className="border-gray-200 shadow-sm">
					<CardContent className="space-y-5 p-6">
						{unknownEmail ? (
							// Verified, but nobody by that address is registered here.
							<div className="space-y-4">
								<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
									<p className="font-medium">No examiner record for {unknownEmail}</p>
									<p className="mt-1 text-xs leading-relaxed">
										If you have already registered, your registration may still be awaiting approval — you will
										be able to sign in once the Office of the Controller of Examinations approves it. Otherwise
										register below.
									</p>
								</div>
								<div className="grid gap-2">
									<Link href="/engg-examiner-registration" className="block">
										<Button variant="outline" className="h-auto w-full justify-start gap-3 py-3">
											<GraduationCap className="h-4 w-4 shrink-0 text-emerald-600" />
											<span className="flex-1 text-left">
												<span className="block text-sm font-medium">Engineering &amp; Technology</span>
												<span className="block text-xs text-muted-foreground">Register as an examiner</span>
											</span>
											<ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
										</Button>
									</Link>
									<Link href="/arts-examiner-registration" className="block">
										<Button variant="outline" className="h-auto w-full justify-start gap-3 py-3">
											<BookOpen className="h-4 w-4 shrink-0 text-emerald-600" />
											<span className="flex-1 text-left">
												<span className="block text-sm font-medium">Arts &amp; Science</span>
												<span className="block text-xs text-muted-foreground">Register as an examiner</span>
											</span>
											<ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
										</Button>
									</Link>
								</div>
								<Button variant="ghost" className="w-full text-xs" onClick={() => setUnknownEmail(null)}>
									Try a different address
								</Button>
							</div>
						) : (
							<>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium text-gray-900">Sign in to your question papers</p>
									<p className="text-xs text-gray-500">
										Use the e-mail address your Examiner Order was sent to.
									</p>
								</div>

								<div className="flex justify-center">
									<div id="examiner-google-btn" />
								</div>

								<div className="flex items-center gap-3">
									<span className="h-px flex-1 bg-gray-200" />
									<span className="text-[11px] uppercase tracking-wide text-gray-400">or</span>
									<span className="h-px flex-1 bg-gray-200" />
								</div>

								<PortalOtpSignIn onSignedIn={setExaminer} />

								<p className="flex items-start gap-2 border-t pt-4 text-[11px] leading-relaxed text-gray-500">
									<ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
									<span>
										Question papers are released only to the appointed examiner, and only during the access
										period stated on your order. Every sign-in and download is recorded.
									</span>
								</p>

								<p className="text-center text-xs text-gray-500">
									Not registered yet?{' '}
									<Link href="/engg-examiner-registration" className="font-medium text-emerald-700 underline">
										Engineering
									</Link>{' '}
									·{' '}
									<Link href="/arts-examiner-registration" className="font-medium text-emerald-700 underline">
										Arts &amp; Science
									</Link>
								</p>
							</>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	)
}
