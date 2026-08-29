'use client'

// Spec §9: the Examiner Order design is configurable per institution, and §6:
// the portal's documents are the CoE's text, not the developer's.
//
// Six documents live here. Each is saved either as the institution default
// (no session chosen) or as an override for one examination session. Header,
// logo, fonts, colours, margins and the signature block come from PDF Settings,
// which this tab links to rather than duplicating.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	Loader2, Plus, Trash2, Save, Eye, GripVertical, Settings2, RotateCcw, Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QpContentClause, QpPortalDocType } from '@/types/qp-examiner-assignment'
import { apiFetch, type SessionOpt } from './shared'

interface Props {
	institutionsId: string
	session: SessionOpt | null
}

interface DocState {
	title: string
	subtitle: string
	intro_text: string
	body: QpContentClause[]
	footer_note: string
	session_label: string
	letter_ref: string
	contact_email: string
	rate_per_paper: string
	rate_in_words: string
	signatory_name: string
	signatory_designation: string
	is_fallback: boolean
}

const DOCS: { key: QpPortalDocType; label: string; blurb: string }[] = [
	{ key: 'order', label: 'Examiner Order', blurb: 'The appointment order the examiner receives by e-mail and downloads from the portal.' },
	{ key: 'instructions', label: 'Paper Instructions', blurb: 'What the setter must follow when framing the question paper.' },
	{ key: 'guidelines', label: 'Examiner Guidelines', blurb: 'How the portal and the question paper must be handled.' },
	{ key: 'checklist', label: 'Check List', blurb: 'The self-check the setter answers before submitting.' },
	{ key: 'declaration', label: 'Declaration', blurb: 'What the setter declares on submission.' },
	{ key: 'claim', label: 'Claim Form', blurb: 'Remuneration notes and the rate printed on the claim form.' },
]

/** Which extra fields each document actually prints. */
const SHOWS = {
	letterRef: new Set<QpPortalDocType>(['order']),
	sessionLabel: new Set<QpPortalDocType>(['order', 'claim']),
	contact: new Set<QpPortalDocType>(['order', 'instructions', 'guidelines']),
	rate: new Set<QpPortalDocType>(['claim']),
	signatory: new Set<QpPortalDocType>(['order']),
	intro: new Set<QpPortalDocType>(['order']),
}

function emptyDoc(): DocState {
	return {
		title: '',
		subtitle: '',
		intro_text: '',
		body: [],
		footer_note: '',
		session_label: '',
		letter_ref: '',
		contact_email: '',
		rate_per_paper: '',
		rate_in_words: '',
		signatory_name: '',
		signatory_designation: '',
		is_fallback: true,
	}
}

let clauseSeq = 0
const nextClauseId = () => `c${Date.now().toString(36)}${(clauseSeq++).toString(36)}`

export function ContentTab({ institutionsId, session }: Props) {
	const { toast } = useToast()

	const [scope, setScope] = useState<'default' | 'session'>('default')
	const [active, setActive] = useState<QpPortalDocType>('order')
	const [docs, setDocs] = useState<Record<string, DocState>>({})
	const [loading, setLoading] = useState(false)
	const [saving, setSaving] = useState(false)

	const scopedSessionId = scope === 'session' ? session?.id || null : null

	const load = useCallback(async () => {
		if (!institutionsId) return
		setLoading(true)
		try {
			const qs = new URLSearchParams({ institutions_id: institutionsId })
			if (scopedSessionId) qs.set('examination_session_id', scopedSessionId)
			const json = await apiFetch(`/api/pre-exam/qp-portal-content?${qs}`)

			const next: Record<string, DocState> = {}
			for (const d of DOCS) {
				const row = json.data?.[d.key]
				next[d.key] = row
					? {
							title: row.title || '',
							subtitle: row.subtitle || '',
							intro_text: row.intro_text || '',
							body: (row.body || []).map((c: QpContentClause) => ({ ...c, id: c.id || nextClauseId() })),
							footer_note: row.footer_note || '',
							session_label: row.session_label || '',
							letter_ref: row.letter_ref || '',
							contact_email: row.contact_email || '',
							rate_per_paper: row.rate_per_paper == null ? '' : String(row.rate_per_paper),
							rate_in_words: row.rate_in_words || '',
							signatory_name: row.signatory_name || '',
							signatory_designation: row.signatory_designation || '',
							is_fallback: !!row.is_fallback,
						}
					: emptyDoc()
			}
			setDocs(next)
		} catch (e: any) {
			toast({ title: 'Could not load the portal content', description: e.message, variant: 'destructive' })
		} finally {
			setLoading(false)
		}
	}, [institutionsId, scopedSessionId, toast])

	useEffect(() => {
		load()
	}, [load])

	const doc = docs[active] || emptyDoc()
	const patch = (changes: Partial<DocState>) =>
		setDocs(prev => ({ ...prev, [active]: { ...(prev[active] || emptyDoc()), ...changes } }))

	const setClause = (id: string, text: string) =>
		patch({ body: doc.body.map(c => (c.id === id ? { ...c, text } : c)) })
	const addClause = () => patch({ body: [...doc.body, { id: nextClauseId(), text: '' }] })
	const removeClause = (id: string) => patch({ body: doc.body.filter(c => c.id !== id) })
	const moveClause = (id: string, delta: number) => {
		const i = doc.body.findIndex(c => c.id === id)
		const j = i + delta
		if (i < 0 || j < 0 || j >= doc.body.length) return
		const next = [...doc.body]
		;[next[i], next[j]] = [next[j], next[i]]
		patch({ body: next })
	}

	const save = async () => {
		if (scope === 'session' && !session?.id) {
			toast({ title: 'Select an examination session first', variant: 'destructive' })
			return
		}
		setSaving(true)
		try {
			const res = await apiFetch('/api/pre-exam/qp-portal-content', {
				method: 'PUT',
				body: JSON.stringify({
					institutions_id: institutionsId,
					examination_session_id: scopedSessionId,
					doc_type: active,
					title: doc.title,
					subtitle: doc.subtitle,
					intro_text: doc.intro_text,
					body: doc.body.filter(c => c.text.trim()),
					footer_note: doc.footer_note,
					session_label: doc.session_label,
					letter_ref: doc.letter_ref,
					contact_email: doc.contact_email,
					rate_per_paper: doc.rate_per_paper,
					rate_in_words: doc.rate_in_words,
					signatory_name: doc.signatory_name,
					signatory_designation: doc.signatory_designation,
				}),
			})
			toast({ title: 'Saved', description: res.message })
			patch({ is_fallback: false })
		} catch (e: any) {
			toast({ title: 'Could not save', description: e.message, variant: 'destructive' })
		} finally {
			setSaving(false)
		}
	}

	const removeOverride = async () => {
		if (!scopedSessionId) return
		try {
			const res = await apiFetch(
				`/api/pre-exam/qp-portal-content?institutions_id=${institutionsId}&doc_type=${active}&examination_session_id=${scopedSessionId}`,
				{ method: 'DELETE' }
			)
			toast({ title: 'Override removed', description: res.message })
			load()
		} catch (e: any) {
			toast({ title: 'Could not remove the override', description: e.message, variant: 'destructive' })
		}
	}

	const meta = DOCS.find(d => d.key === active)!

	return (
		<Card>
			<CardHeader className="px-4 py-3 border-b">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<p className="text-base font-semibold">Examiner Order &amp; Portal Content</p>
						<p className="text-xs text-muted-foreground">
							The wording of every document the examiner sees. Logo, header, fonts, margins and the
							signature block come from PDF Settings.
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" asChild>
							<Link href="/master/pdf-settings">
								<Settings2 className="h-4 w-4 mr-1.5" />
								PDF Settings
							</Link>
						</Button>
						<Button variant="outline" size="sm" onClick={load} disabled={loading}>
							<RotateCcw className={cn('h-4 w-4 mr-1.5', loading && 'animate-spin')} />
							Reload
						</Button>
					</div>
				</div>

				<div className="mt-3">
					<Tabs value={scope} onValueChange={v => setScope(v as 'default' | 'session')}>
						<TabsList>
							<TabsTrigger value="default">Institution default</TabsTrigger>
							<TabsTrigger value="session" disabled={!session}>
								This session only
							</TabsTrigger>
						</TabsList>
					</Tabs>
					<p className="text-xs text-muted-foreground mt-1.5">
						{scope === 'default'
							? 'Used for every examination session that has no wording of its own.'
							: `Overrides the institution default for ${session?.session_name}. Remove the override to fall back.`}
					</p>
				</div>
			</CardHeader>

			<CardContent className="p-4">
				{loading ? (
					<div className="p-10 flex justify-center">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<Tabs value={active} onValueChange={v => setActive(v as QpPortalDocType)}>
						<TabsList className="flex-wrap h-auto">
							{DOCS.map(d => (
								<TabsTrigger key={d.key} value={d.key} className="text-xs">
									{d.label}
									{docs[d.key]?.is_fallback && (
										<Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0">
											default text
										</Badge>
									)}
								</TabsTrigger>
							))}
						</TabsList>

						<TabsContent value={active} className="pt-4 space-y-4">
							<p className="text-sm text-muted-foreground">{meta.blurb}</p>

							{doc.is_fallback && (
								<div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 flex gap-2">
									<Info className="h-4 w-4 shrink-0 mt-0.5" />
									<span>
										Nothing has been saved for this document yet, so the built-in wording below is
										what examiners currently see. Edit and save to make it your own.
									</span>
								</div>
							)}

							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								<div>
									<Label htmlFor="doc_title" className="text-xs">Title</Label>
									<Input
										id="doc_title"
										value={doc.title}
										onChange={e => patch({ title: e.target.value })}
										className="h-9 mt-1"
									/>
								</div>
								<div>
									<Label htmlFor="doc_subtitle" className="text-xs">Subtitle</Label>
									<Input
										id="doc_subtitle"
										value={doc.subtitle}
										onChange={e => patch({ subtitle: e.target.value })}
										className="h-9 mt-1"
									/>
								</div>

								{SHOWS.letterRef.has(active) && (
									<div>
										<Label htmlFor="letter_ref" className="text-xs">Order reference prefix</Label>
										<Input
											id="letter_ref"
											value={doc.letter_ref}
											onChange={e => patch({ letter_ref: e.target.value })}
											placeholder="JKKNCET/COE/UG/NOV-DEC-2026"
											className="h-9 mt-1"
										/>
										<p className="text-[11px] text-muted-foreground mt-1">
											A serial number is appended per order, e.g. …/007.
										</p>
									</div>
								)}
								{SHOWS.sessionLabel.has(active) && (
									<div>
										<Label htmlFor="session_label" className="text-xs">Printed session label</Label>
										<Input
											id="session_label"
											value={doc.session_label}
											onChange={e => patch({ session_label: e.target.value })}
											placeholder="NOV / DEC - 2026"
											className="h-9 mt-1"
										/>
									</div>
								)}
								{SHOWS.contact.has(active) && (
									<div>
										<Label htmlFor="contact_email" className="text-xs">Contact e-mail</Label>
										<Input
											id="contact_email"
											type="email"
											value={doc.contact_email}
											onChange={e => patch({ contact_email: e.target.value })}
											placeholder="dcoe@jkkn.ac.in"
											className="h-9 mt-1"
										/>
									</div>
								)}
								{SHOWS.rate.has(active) && (
									<>
										<div>
											<Label htmlFor="rate" className="text-xs">Rate per question paper (₹)</Label>
											<Input
												id="rate"
												type="number"
												min="0"
												step="0.01"
												value={doc.rate_per_paper}
												onChange={e => patch({ rate_per_paper: e.target.value })}
												className="h-9 mt-1"
											/>
											<p className="text-[11px] text-muted-foreground mt-1">
												Copied onto each assignment at the moment it is created, so changing it
												later never restates a past claim.
											</p>
										</div>
										<div>
											<Label htmlFor="rate_words" className="text-xs">Rate in words</Label>
											<Input
												id="rate_words"
												value={doc.rate_in_words}
												onChange={e => patch({ rate_in_words: e.target.value })}
												placeholder="Rupees Two Thousand only"
												className="h-9 mt-1"
											/>
										</div>
									</>
								)}
								{SHOWS.signatory.has(active) && (
									<>
										<div>
											<Label htmlFor="sig_name" className="text-xs">Signatory name</Label>
											<Input
												id="sig_name"
												value={doc.signatory_name}
												onChange={e => patch({ signatory_name: e.target.value })}
												className="h-9 mt-1"
											/>
										</div>
										<div>
											<Label htmlFor="sig_desig" className="text-xs">Signatory designation</Label>
											<Input
												id="sig_desig"
												value={doc.signatory_designation}
												onChange={e => patch({ signatory_designation: e.target.value })}
												placeholder="Controller of Examinations"
												className="h-9 mt-1"
											/>
										</div>
									</>
								)}
							</div>

							{SHOWS.intro.has(active) && (
								<div>
									<Label htmlFor="intro" className="text-xs">Opening paragraph</Label>
									<Textarea
										id="intro"
										value={doc.intro_text}
										onChange={e => patch({ intro_text: e.target.value })}
										rows={3}
										placeholder="Left blank, a sentence naming the examiner type, subject and examination is generated."
										className="mt-1"
									/>
								</div>
							)}

							{/* Clauses */}
							<div>
								<div className="flex items-center justify-between">
									<Label className="text-xs uppercase tracking-wide text-muted-foreground">
										{active === 'checklist' ? 'Check-list items' : active === 'declaration' ? 'Declaration points' : 'Numbered clauses'}
									</Label>
									<Button variant="outline" size="sm" onClick={addClause}>
										<Plus className="h-3.5 w-3.5 mr-1" />
										Add
									</Button>
								</div>
								<div className="mt-2 space-y-2">
									{doc.body.length === 0 && (
										<p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
											No clauses. Add one, or save empty to use the built-in wording.
										</p>
									)}
									{doc.body.map((c, i) => (
										<div key={c.id} className="flex items-start gap-2">
											<div className="flex flex-col items-center pt-1.5 text-muted-foreground">
												<button
													type="button"
													onClick={() => moveClause(c.id, -1)}
													disabled={i === 0}
													className="disabled:opacity-30 text-xs leading-none hover:text-foreground"
													aria-label="Move up"
												>
													▲
												</button>
												<GripVertical className="h-3 w-3 my-0.5" />
												<button
													type="button"
													onClick={() => moveClause(c.id, 1)}
													disabled={i === doc.body.length - 1}
													className="disabled:opacity-30 text-xs leading-none hover:text-foreground"
													aria-label="Move down"
												>
													▼
												</button>
											</div>
											<span className="pt-2 text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
											<Textarea
												value={c.text}
												onChange={e => setClause(c.id, e.target.value)}
												rows={2}
												className="flex-1"
											/>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8 mt-1 text-rose-600"
												onClick={() => removeClause(c.id)}
												aria-label="Remove clause"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									))}
								</div>
							</div>

							<div>
								<Label htmlFor="footer" className="text-xs">Footer note</Label>
								<Textarea
									id="footer"
									value={doc.footer_note}
									onChange={e => patch({ footer_note: e.target.value })}
									rows={2}
									className="mt-1"
								/>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
								<div className="flex gap-2">
									{active === 'order' && (
										<Button variant="outline" size="sm" disabled title="Assign a paper first, then preview its order from the Assignments tab">
											<Eye className="h-4 w-4 mr-1.5" />
											Preview from an assignment
										</Button>
									)}
									{scope === 'session' && !doc.is_fallback && (
										<Button variant="outline" size="sm" className="text-rose-600" onClick={removeOverride}>
											<Trash2 className="h-4 w-4 mr-1.5" />
											Remove session override
										</Button>
									)}
								</div>
								<Button onClick={save} disabled={saving}>
									{saving ? (
										<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
									) : (
										<Save className="h-4 w-4 mr-1.5" />
									)}
									Save {meta.label}
								</Button>
							</div>
						</TabsContent>
					</Tabs>
				)}
			</CardContent>
		</Card>
	)
}
