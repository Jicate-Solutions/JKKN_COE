'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowRight, CheckCircle, Loader2, RefreshCw } from 'lucide-react'
import { useToast } from '@/hooks/common/use-toast'
import type { LearnerIdentityPlan } from '@/lib/learner-identity-sync'

interface LearnerSyncDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Limits the sync to one institution; omitted, every institution is covered. */
	institutionsId?: string | null
	/** Called after a sync that changed something, so the page can reload. */
	onSynced?: () => void
}

const ENDPOINT = '/api/exam-management/exam-registrations/sync-learners'

/**
 * "Sync from MyJKKN": shows which learner names and register numbers on COE
 * records differ from MyJKKN, then updates them on confirmation. The same run
 * happens automatically once a day (/api/cron/sync-learner-identity).
 */
export function LearnerSyncDialog({ open, onOpenChange, institutionsId, onSynced }: LearnerSyncDialogProps) {
	const { toast } = useToast()
	const [plan, setPlan] = useState<LearnerIdentityPlan | null>(null)
	const [loading, setLoading] = useState(false)
	const [applying, setApplying] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const loadPreview = useCallback(async () => {
		setLoading(true)
		setError(null)
		setPlan(null)
		try {
			const res = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ institutions_id: institutionsId || undefined, preview_only: true }),
			})
			const json = await res.json().catch(() => null)
			if (!res.ok) throw new Error(json?.error || 'Could not compare with MyJKKN.')
			setPlan(json.plan)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not compare with MyJKKN.')
		} finally {
			setLoading(false)
		}
	}, [institutionsId])

	useEffect(() => {
		if (open) loadPreview()
	}, [open, loadPreview])

	const handleApply = async () => {
		setApplying(true)
		try {
			const res = await fetch(ENDPOINT, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ institutions_id: institutionsId || undefined }),
			})
			const json = await res.json().catch(() => null)
			if (!res.ok) throw new Error(json?.error || 'Sync failed.')
			toast({
				title: json?.success ? 'Synced from MyJKKN' : 'Synced with errors',
				description: json?.message,
				variant: json?.success ? undefined : 'destructive',
			})
			onSynced?.()
			onOpenChange(false)
		} catch (err) {
			toast({
				title: 'Sync failed',
				description: err instanceof Error ? err.message : 'Unexpected error',
				variant: 'destructive',
			})
		} finally {
			setApplying(false)
		}
	}

	const changes = plan?.changes || []
	const skipped = plan?.skipped || []
	const nameCount = changes.filter(change => change.name).length
	const numberCount = changes.filter(change => change.register_number).length

	return (
		<Dialog open={open} onOpenChange={next => !applying && onOpenChange(next)}>
			<DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>Sync learners from MyJKKN</DialogTitle>
					<DialogDescription>
						Updates the learner name and register number on exam registrations, fee and result records
						to match MyJKKN. Learners are matched by their MyJKKN id, which never changes.
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 min-h-0 overflow-y-auto space-y-4">
					{loading && (
						<div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Comparing COE records with MyJKKN…
						</div>
					)}

					{error && !loading && (
						<div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
							<AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
							<span>{error}</span>
						</div>
					)}

					{plan && !loading && (
						<>
							<div className="flex flex-wrap items-center gap-2 text-xs">
								<Badge variant="outline">{plan.scanned.learners} learners checked</Badge>
								<Badge variant="outline">{nameCount} name{nameCount === 1 ? '' : 's'} to update</Badge>
								<Badge variant="outline">{numberCount} register number{numberCount === 1 ? '' : 's'} to update</Badge>
								{skipped.length > 0 && (
									<Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
										{skipped.length} need checking
									</Badge>
								)}
								{plan.scanned.without_profile > 0 && (
									<Badge variant="outline">{plan.scanned.without_profile} not in MyJKKN</Badge>
								)}
							</div>

							{plan.errors.length > 0 && (
								<div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
									Some tables could not be read and are left out of this run: {plan.errors.join('; ')}
								</div>
							)}

							{changes.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
									<CheckCircle className="h-6 w-6 text-emerald-500" />
									Everything already matches MyJKKN.
								</div>
							) : (
								<div className="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="text-xs w-12">Sl.No</TableHead>
												<TableHead className="text-xs">Learner</TableHead>
												<TableHead className="text-xs">Name</TableHead>
												<TableHead className="text-xs">Register number</TableHead>
												<TableHead className="text-xs text-right w-16">Rows</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{changes.map((change, index) => (
												<TableRow key={change.learner_id}>
													<TableCell className="text-xs">{index + 1}</TableCell>
													<TableCell className="text-xs">
														<div className="font-medium">{change.current_name || '—'}</div>
														<div className="text-muted-foreground">{change.current_register_number || '—'}</div>
													</TableCell>
													<TableCell className="text-xs">
														{change.name ? (
															<Diff from={change.name.from} to={change.name.to} />
														) : (
															<span className="text-muted-foreground">No change</span>
														)}
													</TableCell>
													<TableCell className="text-xs">
														{change.register_number ? (
															<Diff from={change.register_number.from} to={change.register_number.to} />
														) : (
															<span className="text-muted-foreground">No change</span>
														)}
													</TableCell>
													<TableCell className="text-xs text-right">{change.rows}</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>
								</div>
							)}

							{skipped.length > 0 && (
								<div className="space-y-2">
									<h3 className="text-sm font-semibold">Not updated — needs checking</h3>
									<div className="rounded-md border">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead className="text-xs">Learner</TableHead>
													<TableHead className="text-xs">Reason</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{skipped.map((item, index) => (
													<TableRow key={`${item.learner_id}-${index}`}>
														<TableCell className="text-xs">
															<div className="font-medium">{item.name || '—'}</div>
															<div className="text-muted-foreground">{item.register_number || '—'}</div>
														</TableCell>
														<TableCell className="text-xs">{item.reason}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								</div>
							)}
						</>
					)}
				</div>

				<DialogFooter className="gap-2">
					<Button variant="outline" size="sm" onClick={loadPreview} disabled={loading || applying}>
						<RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
						Check again
					</Button>
					<Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={applying}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleApply} disabled={loading || applying || changes.length === 0}>
						{applying && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
						{applying ? 'Updating…' : `Update ${changes.length} learner${changes.length === 1 ? '' : 's'}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// whitespace-pre-wrap: some corrections are only a doubled space, which the
// browser would otherwise collapse and show as "no difference".
function Diff({ from, to }: { from: string[]; to: string }) {
	return (
		<div className="flex items-center gap-1.5 flex-wrap">
			<span className="text-muted-foreground line-through whitespace-pre-wrap">
				{from.map(value => value || '(blank)').join(', ')}
			</span>
			<ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
			<span className="font-medium whitespace-pre-wrap">{to}</span>
		</div>
	)
}
