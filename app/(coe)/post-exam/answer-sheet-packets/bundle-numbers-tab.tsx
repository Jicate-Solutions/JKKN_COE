'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useExaminationSession } from '@/context/examination-session-context'
import { Hash, Search, Sparkles, RefreshCw, Trash2, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import type { BundleNumberDetailView, BundleNumberGenerationResult } from '@/types/bundle-numbers'

interface InstitutionOption {
	id: string
	institution_code: string
	name: string
}

interface SessionOption {
	id: string
	session_code: string
	session_name?: string
	institutions_id?: string
}

export default function BundleNumbersTab() {
	const { toast } = useToast()
	const {
		isReady,
		appendToUrl,
		institutionCode,
		mustSelectInstitution,
	} = useInstitutionFilter()

	let globalSession: { id: string; session_code: string } | null = null
	try {
		const ctx = useExaminationSession()
		globalSession = ctx.currentSession as any
	} catch {}
	const mustSelectSession = !globalSession

	// Generation state
	const [genInstitution, setGenInstitution] = useState('')
	const [genSession, setGenSession] = useState('')
	const [startNumber, setStartNumber] = useState<string>('1')
	const [generating, setGenerating] = useState(false)
	const [result, setResult] = useState<BundleNumberGenerationResult | null>(null)

	// Data
	const [institutions, setInstitutions] = useState<InstitutionOption[]>([])
	const [sessions, setSessions] = useState<SessionOption[]>([])
	const [items, setItems] = useState<BundleNumberDetailView[]>([])
	const [loading, setLoading] = useState(true)

	// List filters / sort / pagination
	const [searchTerm, setSearchTerm] = useState('')
	const [sessionFilter, setSessionFilter] = useState('all')
	const [boardFilter, setBoardFilter] = useState('all')
	const [currentPage, setCurrentPage] = useState(1)
	const itemsPerPage = 15

	const effectiveInstitutionCode = mustSelectInstitution ? genInstitution : institutionCode

	useEffect(() => {
		if (globalSession?.session_code) {
			setGenSession(globalSession.session_code)
			setSessionFilter(globalSession.session_code)
		}
	}, [globalSession?.session_code])

	const fetchInstitutions = async () => {
		try {
			const res = await fetch('/api/master/institutions')
			if (res.ok) setInstitutions(await res.json())
		} catch (e) {
			console.error('Error fetching institutions:', e)
		}
	}

	const fetchSessions = async () => {
		try {
			const res = await fetch(appendToUrl('/api/exam-management/examination-sessions'))
			if (res.ok) setSessions(await res.json())
		} catch (e) {
			console.error('Error fetching sessions:', e)
		}
	}

	const fetchBundleNumbers = async () => {
		try {
			setLoading(true)
			const params = new URLSearchParams()
			if (effectiveInstitutionCode) params.append('institution_code', effectiveInstitutionCode)
			if (sessionFilter !== 'all') params.append('exam_session', sessionFilter)
			const res = await fetch(`/api/post-exam/bundle-numbers?${params.toString()}`)
			if (res.ok) {
				setItems(await res.json())
			} else {
				setItems([])
			}
		} catch (e) {
			console.error('Error fetching bundle numbers:', e)
			setItems([])
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		if (!isReady) return
		if (mustSelectInstitution) fetchInstitutions()
		fetchSessions()
		fetchBundleNumbers()
	}, [isReady, institutionCode])

	useEffect(() => {
		if (!isReady) return
		fetchBundleNumbers()
	}, [sessionFilter, genInstitution])

	const filteredSessions = useMemo(() => {
		if (mustSelectInstitution && genInstitution) {
			const inst = institutions.find(i => i.institution_code === genInstitution)
			if (inst) return sessions.filter(s => s.institutions_id === inst.id)
		}
		return sessions
	}, [sessions, mustSelectInstitution, genInstitution, institutions])

	const allBoards = useMemo(() => {
		const set = new Map<string, { code: string; name: string; order: number }>()
		for (const it of items) {
			if (it.board_code && !set.has(it.board_code)) {
				set.set(it.board_code, {
					code: it.board_code,
					name: it.board_name || it.board_code,
					order: it.board_order ?? 999,
				})
			}
		}
		return Array.from(set.values()).sort((a, b) => a.order - b.order)
	}, [items])

	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		return items.filter(it => {
			if (boardFilter !== 'all' && it.board_code !== boardFilter) return false
			if (!q) return true
			const fields = [String(it.bundle_number), it.course_code, it.course_name || '', it.board_code || '', it.board_name || '']
			return fields.some(v => v.toLowerCase().includes(q))
		})
	}, [items, searchTerm, boardFilter])

	const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1
	const startIndex = (currentPage - 1) * itemsPerPage
	const pageItems = filtered.slice(startIndex, startIndex + itemsPerPage)

	useEffect(() => setCurrentPage(1), [searchTerm, boardFilter, sessionFilter])

	const handleGenerate = async () => {
		if (!effectiveInstitutionCode || !genSession) {
			toast({
				title: 'Validation Error',
				description: !effectiveInstitutionCode ? 'Please select an institution.' : 'Please select an examination session.',
				variant: 'destructive',
			})
			return
		}
		const startNum = Number(startNumber)
		if (!Number.isFinite(startNum) || startNum < 1) {
			toast({
				title: 'Validation Error',
				description: 'Bundle start number must be a positive integer.',
				variant: 'destructive',
			})
			return
		}

		try {
			setGenerating(true)
			setResult(null)
			const res = await fetch('/api/post-exam/bundle-numbers/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					institution_code: effectiveInstitutionCode,
					exam_session: genSession,
					start_number: startNum,
				}),
			})
			const data = await res.json()
			if (!res.ok) {
				throw new Error(data.error || 'Failed to generate bundle numbers')
			}
			setResult(data as BundleNumberGenerationResult)
			toast({
				title: data.created > 0 ? 'Bundle Numbers Generated' : 'No Changes',
				description: data.message,
			})
			await fetchBundleNumbers()
		} catch (e) {
			toast({
				title: 'Generation Failed',
				description: e instanceof Error ? e.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setGenerating(false)
		}
	}

	const handleDelete = async (id: string) => {
		try {
			const res = await fetch(`/api/post-exam/bundle-numbers/${id}`, { method: 'DELETE' })
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error || 'Failed to delete')
			}
			setItems(prev => prev.filter(p => p.id !== id))
			toast({ title: 'Bundle Number Deleted', description: 'Removed successfully.' })
		} catch (e) {
			toast({
				title: 'Delete Failed',
				description: e instanceof Error ? e.message : 'Unknown error',
				variant: 'destructive',
			})
		}
	}

	return (
		<div className="space-y-6">
			{/* Generation Card */}
			<Card className="border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10">
				<CardHeader>
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
							<Hash className="h-5 w-5 text-white" />
						</div>
						<div>
							<h2 className="text-lg font-heading font-semibold text-gray-900 dark:text-white">
								Generate Bundle Numbers
							</h2>
							<p className="text-sm text-muted-foreground">
								Auto-assign bundle numbers to Theory courses board-wise (board_order &rarr; semester &rarr; course_order &rarr; course_code).
								Existing bundle numbers are preserved.
							</p>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className={`grid grid-cols-1 gap-4 ${mustSelectInstitution ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
						{mustSelectInstitution && (
							<div>
								<Label htmlFor="bn-institution">Institution <span className="text-red-500">*</span></Label>
								<Select value={genInstitution} onValueChange={(v) => { setGenInstitution(v); setGenSession('') }}>
									<SelectTrigger id="bn-institution"><SelectValue placeholder="Select institution" /></SelectTrigger>
									<SelectContent>
										{institutions.map((inst) => (
											<SelectItem key={inst.id} value={inst.institution_code}>
												{inst.institution_code} - {inst.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{mustSelectSession && (
							<div>
								<Label htmlFor="bn-session">Exam Session <span className="text-red-500">*</span></Label>
								<Select
									value={genSession}
									onValueChange={setGenSession}
									disabled={mustSelectInstitution && !genInstitution}
								>
									<SelectTrigger id="bn-session">
										<SelectValue placeholder={mustSelectInstitution && !genInstitution ? 'Select institution first' : 'Select session'} />
									</SelectTrigger>
									<SelectContent>
										{filteredSessions.map((sess) => (
											<SelectItem key={sess.id} value={sess.session_code}>
												{sess.session_name && sess.session_name !== sess.session_code
													? `${sess.session_code} - ${sess.session_name}`
													: sess.session_code}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div>
							<Label htmlFor="bn-start">Bundle Start Number <span className="text-red-500">*</span></Label>
							<Input
								id="bn-start"
								type="number"
								min={1}
								value={startNumber}
								onChange={(e) => setStartNumber(e.target.value)}
								placeholder="e.g. 1 or 100"
							/>
						</div>

						<div className="flex items-end">
							<Button
								onClick={handleGenerate}
								disabled={generating || !effectiveInstitutionCode || !genSession}
								className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700"
							>
								{generating ? (
									<><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Generating...</>
								) : (
									<><Sparkles className="h-4 w-4 mr-2" />Generate</>
								)}
							</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Generation Result */}
			{result && (
				<Card className={result.created > 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/10' : 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'}>
					<CardContent className="pt-6">
						<div className="flex items-start justify-between">
							<div className="flex-1">
								<div className="flex items-center gap-2 mb-3">
									{result.created > 0
										? <CheckCircle className="h-5 w-5 text-green-600" />
										: <CheckCircle className="h-5 w-5 text-blue-600" />}
									<h3 className="font-semibold">{result.message}</h3>
								</div>
								<div className="grid grid-cols-3 gap-4">
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
										<div className="text-xs text-muted-foreground">Created</div>
										<div className="text-xl font-bold text-green-600 dark:text-green-400">{result.created}</div>
									</div>
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
										<div className="text-xs text-muted-foreground">Skipped (already numbered)</div>
										<div className="text-xl font-bold text-blue-600 dark:text-blue-400">{result.skipped}</div>
									</div>
									<div className="bg-white dark:bg-gray-800 rounded-lg p-3 border">
										<div className="text-xs text-muted-foreground">Next available number</div>
										<div className="text-xl font-bold text-amber-600 dark:text-amber-400">{result.next_number}</div>
									</div>
								</div>
							</div>
							<Button variant="ghost" size="icon" onClick={() => setResult(null)} className="ml-2">
								<XCircle className="h-4 w-4" />
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Filters */}
			<Card>
				<CardContent className="pt-6">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<div className="relative">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search course code, name, board..."
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
									className="pl-9"
								/>
							</div>
						</div>
						{mustSelectSession && (
							<div>
								<Select value={sessionFilter} onValueChange={setSessionFilter}>
									<SelectTrigger><SelectValue placeholder="All Sessions" /></SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Sessions</SelectItem>
										{sessions.map((s) => (
											<SelectItem key={s.id} value={s.session_code}>{s.session_code}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						<div>
							<Select value={boardFilter} onValueChange={setBoardFilter}>
								<SelectTrigger><SelectValue placeholder="All Boards" /></SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Boards</SelectItem>
									{allBoards.map((b) => (
										<SelectItem key={b.code} value={b.code}>
											{b.code} - {b.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Listing */}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<h3 className="text-base font-heading font-semibold">Bundle Numbers</h3>
							<p className="text-sm text-muted-foreground">{filtered.length} record(s)</p>
						</div>
						<Button onClick={fetchBundleNumbers} size="sm" variant="outline">
							<RefreshCw className="h-4 w-4 mr-2" />Refresh
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{loading ? (
						<div className="text-center py-8 text-muted-foreground">Loading...</div>
					) : pageItems.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							No bundle numbers yet. Use the form above to generate them.
						</div>
					) : (
						<>
							<div className="rounded-md border overflow-hidden">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead className="w-[100px]">Bundle #</TableHead>
											<TableHead>Board</TableHead>
											<TableHead>Course Code</TableHead>
											<TableHead>Course Name</TableHead>
											<TableHead>Session</TableHead>
											<TableHead>Created</TableHead>
											<TableHead className="text-right">Actions</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{pageItems.map((it) => (
											<TableRow key={it.id}>
												<TableCell className="font-bold text-amber-700 dark:text-amber-400">
													{it.bundle_number}
												</TableCell>
												<TableCell>
													<Badge variant="outline">
														{it.board_code || '—'}
													</Badge>
												</TableCell>
												<TableCell className="font-medium">{it.course_code}</TableCell>
												<TableCell className="text-muted-foreground">{it.course_name || '—'}</TableCell>
												<TableCell>{it.session_code}</TableCell>
												<TableCell className="text-xs text-muted-foreground">
													{it.created_at ? new Date(it.created_at).toLocaleDateString() : ''}
												</TableCell>
												<TableCell className="text-right">
													<AlertDialog>
														<AlertDialogTrigger asChild>
															<Button variant="ghost" size="icon" className="text-red-600 hover:text-red-700 hover:bg-red-50">
																<Trash2 className="h-4 w-4" />
															</Button>
														</AlertDialogTrigger>
														<AlertDialogContent>
															<AlertDialogHeader>
																<AlertDialogTitle>Delete Bundle Number?</AlertDialogTitle>
																<AlertDialogDescription>
																	Bundle <strong>#{it.bundle_number}</strong> for{' '}
																	<strong>{it.course_code}</strong> will be permanently removed.
																</AlertDialogDescription>
															</AlertDialogHeader>
															<AlertDialogFooter>
																<AlertDialogCancel>Cancel</AlertDialogCancel>
																<AlertDialogAction
																	onClick={() => handleDelete(it.id)}
																	className="bg-red-600 hover:bg-red-700"
																>
																	Delete
																</AlertDialogAction>
															</AlertDialogFooter>
														</AlertDialogContent>
													</AlertDialog>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>

							{/* Pagination */}
							<div className="flex items-center justify-between mt-4">
								<div className="text-sm text-muted-foreground">
									Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filtered.length)} of {filtered.length}
								</div>
								<div className="flex items-center gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
										disabled={currentPage === 1}
									>
										<ChevronLeft className="h-4 w-4" />
									</Button>
									<div className="text-sm font-medium">Page {currentPage} of {totalPages}</div>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
										disabled={currentPage === totalPages}
									>
										<ChevronRight className="h-4 w-4" />
									</Button>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
