'use client'

// The second way into the portal, for an examiner whose registered address is
// not Google-backed (a private college domain, an older provider). The code is
// generated, hashed and mailed by /api/examiner-portal/auth/otp; nothing here
// decides who gets in.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/common/use-toast'
import { Loader2, KeyRound, ArrowLeft, Mail } from 'lucide-react'

interface Props {
	/** Called with the signed-in examiner once the code checks out. */
	onSignedIn: (examiner: { id: string; full_name: string; email: string; kind: 'internal' | 'external' }) => void
}

export function PortalOtpSignIn({ onSignedIn }: Props) {
	const { toast } = useToast()

	const [open, setOpen] = useState(false)
	const [stage, setStage] = useState<'email' | 'code'>('email')
	const [email, setEmail] = useState('')
	const [code, setCode] = useState('')
	const [busy, setBusy] = useState(false)

	const post = async (body: Record<string, unknown>) => {
		const res = await fetch('/api/examiner-portal/auth/otp', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		})
		const json = await res.json().catch(() => ({}))
		if (!res.ok) throw new Error(json?.message || json?.error || `HTTP ${res.status}`)
		return json
	}

	const sendCode = async () => {
		setBusy(true)
		try {
			const json = await post({ action: 'send', email })
			toast({ title: 'Check your inbox', description: json.message })
			setStage('code')
		} catch (e: any) {
			toast({ title: 'Could not send the code', description: e.message, variant: 'destructive' })
		} finally {
			setBusy(false)
		}
	}

	const verify = async () => {
		setBusy(true)
		try {
			const json = await post({ action: 'verify', email, code })
			onSignedIn(json.examiner)
		} catch (e: any) {
			toast({ title: 'Sign-in failed', description: e.message, variant: 'destructive' })
		} finally {
			setBusy(false)
		}
	}

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="mx-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600 transition-colors"
			>
				<KeyRound className="w-3.5 h-3.5" />
				Already an appointed examiner? Sign in with an e-mail code instead
			</button>
		)
	}

	return (
		<div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium flex items-center gap-2">
					<KeyRound className="w-4 h-4 text-blue-600" />
					Sign in with an e-mail code
				</p>
				<button
					type="button"
					onClick={() => {
						setOpen(false)
						setStage('email')
						setCode('')
					}}
					className="text-xs text-gray-400 hover:text-gray-600"
				>
					Close
				</button>
			</div>

			{stage === 'email' ? (
				<>
					<p className="text-xs text-gray-500">
						Enter the e-mail address the Office of the Controller of Examinations has on record for
						you. We will send a 6-digit code to it.
					</p>
					<div>
						<Label htmlFor="otp_email" className="text-xs">Registered e-mail</Label>
						<Input
							id="otp_email"
							type="email"
							value={email}
							onChange={e => setEmail(e.target.value)}
							placeholder="you@college.edu"
							className="h-11 mt-1"
							autoComplete="email"
						/>
					</div>
					<Button className="w-full h-11" onClick={sendCode} disabled={busy || !email.trim()}>
						{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
						Send code
					</Button>
				</>
			) : (
				<>
					<p className="text-xs text-gray-500">
						Enter the 6-digit code sent to <strong>{email}</strong>. It expires in 10 minutes.
					</p>
					<div>
						<Label htmlFor="otp_code" className="text-xs">6-digit code</Label>
						<Input
							id="otp_code"
							inputMode="numeric"
							maxLength={6}
							value={code}
							onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
							placeholder="000000"
							className="h-11 mt-1 tracking-[0.4em] text-center text-lg"
							autoComplete="one-time-code"
						/>
					</div>
					<Button className="w-full h-11" onClick={verify} disabled={busy || code.length !== 6}>
						{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
						Sign in
					</Button>
					<button
						type="button"
						onClick={() => {
							setStage('email')
							setCode('')
						}}
						className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mx-auto"
					>
						<ArrowLeft className="w-3.5 h-3.5" />
						Use a different address
					</button>
				</>
			)}
		</div>
	)
}
