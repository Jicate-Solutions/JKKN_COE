'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { AppFooter } from '@/components/layout/app-footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from '@/components/ui/sheet'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from '@/components/ui/dialog'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useToast } from '@/hooks/common/use-toast'
import {
	Plus,
	Search,
	RefreshCw,
	Pencil,
	Trash2,
	ChevronUp,
	ChevronDown,
	Loader2,
	X,
	AppWindow,
	UserSearch,
	ArrowLeft,
	Key,
	Shield,
	Copy,
	Check,
	AlertTriangle,
	XCircle,
	Save,
	Info,
	PlusCircle,
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
} from 'lucide-react'
import Link from 'next/link'
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type {
	ApiApplication,
	ApiKey,
	ApiKeyCreateResponse,
	ApiPermission,
	ApiModule,
	ApiOperation,
} from '@/types/api-management'
import { API_MODULES, API_OPERATIONS } from '@/types/api-management'

// ── Constants ─────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10

const MODULE_LABELS: Record<ApiModule, string> = {
	results: 'Results',
	registrations: 'Registrations',
	marks: 'Marks',
	'cia-marks': 'CIA Marks',
	'cia-settings': 'CIA Settings',
	'cia-report': 'CIA Report',
	institutions: 'Institutions',
	'examination-sessions': 'Exam Sessions',
	learners: 'Learners',
	timetables: 'Timetables',
	courses: 'Courses',
	'course-mapping': 'Course Mapping',
}

const OPERATION_LABELS: Record<ApiOperation, string> = {
	read: 'Read',
	create: 'Create',
	update: 'Update',
	delete: 'Delete',
}

const OPERATION_COLORS: Record<ApiOperation, string> = {
	read: 'bg-blue-50 text-blue-700 border-blue-200',
	create: 'bg-green-50 text-green-700 border-green-200',
	update: 'bg-yellow-50 text-yellow-700 border-yellow-200',
	delete: 'bg-red-50 text-red-700 border-red-200',
}

function permKey(module: ApiModule, op: ApiOperation) {
	return `${module}:${op}`
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatDate(d?: string | null) {
	if (!d) return '—'
	return new Date(d).toLocaleDateString('en-IN', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
	})
}

function statusBadgeClass(status: ApiKey['status']) {
	switch (status) {
		case 'active':
			return 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:text-green-400'
		case 'revoked':
			return 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:text-red-400'
		case 'expired':
			return 'bg-gray-100 border-gray-200 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400'
	}
}

// ── StatCard ──────────────────────────────────────────────────────────

function StatCard({
	label,
	value,
	color,
}: {
	label: string
	value: number
	color: 'blue' | 'green' | 'red' | 'purple'
}) {
	const colors = {
		blue: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/10 dark:border-blue-800 dark:text-blue-400',
		green: 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/10 dark:border-green-800 dark:text-green-400',
		red: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/10 dark:border-red-800 dark:text-red-400',
		purple: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/10 dark:border-purple-800 dark:text-purple-400',
	}
	return (
		<div className={`rounded-lg border p-4 ${colors[color]}`}>
			<p className="text-sm font-medium">{label}</p>
			<p className="text-2xl font-bold">{value}</p>
		</div>
	)
}

// ── SortableHead ──────────────────────────────────────────────────────

function SortableHead({
	label,
	column,
	sortColumn,
	sortDir,
	onSort,
}: {
	label: string
	column: string
	sortColumn: string | null
	sortDir: 'asc' | 'desc'
	onSort: (col: string) => void
}) {
	return (
		<TableHead
			className="cursor-pointer select-none"
			onClick={() => onSort(column)}
		>
			<div className="flex items-center gap-1">
				{label}
				{sortColumn === column &&
					(sortDir === 'asc' ? (
						<ChevronUp className="h-3 w-3" />
					) : (
						<ChevronDown className="h-3 w-3" />
					))}
			</div>
		</TableHead>
	)
}

// ── DomainTagInput ────────────────────────────────────────────────────

function DomainTagInput({
	domains,
	onChange,
}: {
	domains: string[]
	onChange: (d: string[]) => void
}) {
	const [input, setInput] = useState('')

	const addDomains = () => {
		const parts = input
			.split(',')
			.map(s => s.trim())
			.filter(s => s.length > 0)
		if (parts.length === 0) return
		onChange([...domains, ...parts.filter(p => !domains.includes(p))])
		setInput('')
	}

	const remove = (d: string) => onChange(domains.filter(x => x !== d))

	return (
		<div className="space-y-2">
			<div className="flex gap-2">
				<Input
					placeholder="e.g. example.com, app.jkkn.ac.in"
					value={input}
					onChange={e => setInput(e.target.value)}
					onKeyDown={e => {
						if (e.key === 'Enter') {
							e.preventDefault()
							addDomains()
						}
					}}
				/>
				<Button type="button" variant="outline" onClick={addDomains}>
					Add
				</Button>
			</div>
			{domains.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{domains.map(d => (
						<Badge key={d} variant="secondary" className="flex items-center gap-1 pr-1">
							{d}
							<button
								type="button"
								onClick={() => remove(d)}
								className="ml-1 rounded-full hover:bg-muted p-0.5"
								aria-label={`Remove domain ${d}`}
								title={`Remove ${d}`}
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					))}
				</div>
			)}
		</div>
	)
}

// ── CopyButton ────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
	const [copied, setCopied] = useState(false)

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		} catch {
			// fallback for non-HTTPS
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
			{copied ? (
				<Check className="h-3.5 w-3.5 text-green-600" />
			) : (
				<Copy className="h-3.5 w-3.5" />
			)}
			{label ?? (copied ? 'Copied!' : 'Copy')}
		</Button>
	)
}

// ── SecretKeyModal ────────────────────────────────────────────────────

function SecretKeyModal({
	open,
	onClose,
	keyData,
}: {
	open: boolean
	onClose: () => void
	keyData: ApiKeyCreateResponse | null
}) {
	if (!keyData) return null

	return (
		<Dialog open={open} onOpenChange={open => !open && onClose()}>
			<DialogContent
				className="sm:max-w-[520px]"
				onPointerDownOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Key className="h-5 w-5 text-green-600" />
						API Key Generated Successfully
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
						<AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
						<p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
							This secret key will only be shown once. Please copy it now and store
							it securely. You will not be able to retrieve it again.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs uppercase tracking-wider text-muted-foreground">
							Access Key ID
						</Label>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
								{keyData.access_key_id}
							</code>
							<CopyButton text={keyData.access_key_id} />
						</div>
					</div>

					<div className="space-y-1.5">
						<Label className="text-xs uppercase tracking-wider text-muted-foreground">
							Secret Key
						</Label>
						<div className="flex items-center gap-2">
							<code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all border-2 border-yellow-300 dark:border-yellow-700">
								{keyData.secret_key}
							</code>
							<CopyButton text={keyData.secret_key} />
						</div>
					</div>

					<p className="text-xs text-muted-foreground">
						Use these credentials in your application headers:{' '}
						<code className="bg-muted px-1 rounded">X-Access-Key-ID</code> and{' '}
						<code className="bg-muted px-1 rounded">X-Secret-Key</code>
					</p>
				</div>

				<DialogFooter>
					<Button onClick={onClose} className="w-full sm:w-auto">
						I have saved my key — Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

// ── OwnerField ────────────────────────────────────────────────────────

function OwnerField({
	value,
	onChange,
}: {
	value: string
	onChange: (v: string) => void
}) {
	const [ownerSearch, setOwnerSearch] = useState('')
	const [ownerResults, setOwnerResults] = useState<any[]>([])
	const [ownerLoading, setOwnerLoading] = useState(false)
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current)
		if (ownerSearch.trim().length < 2) {
			setOwnerResults([])
			return
		}
		debounceRef.current = setTimeout(async () => {
			try {
				setOwnerLoading(true)
				const res = await fetch(
					`/api/admin/role-management/search-myjkkn?search=${encodeURIComponent(ownerSearch.trim())}`
				)
				if (!res.ok) throw new Error('Search failed')
				const data = await res.json()
				setOwnerResults(data)
			} catch {
				setOwnerResults([])
			} finally {
				setOwnerLoading(false)
			}
		}, 300)
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current)
		}
	}, [ownerSearch])

	if (value) {
		return (
			<div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30">
				<UserSearch className="h-4 w-4 text-muted-foreground shrink-0" />
				<span className="text-sm flex-1 truncate">{value}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 w-6 p-0"
					onClick={() => {
						onChange('')
						setOwnerSearch('')
						setOwnerResults([])
					}}
				>
					<X className="h-3.5 w-3.5" />
				</Button>
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<div className="relative">
				<Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search MyJKKN users by name or email..."
					value={ownerSearch}
					onChange={e => setOwnerSearch(e.target.value)}
					className="pl-9"
				/>
				{ownerLoading && (
					<Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
				)}
			</div>
			{ownerResults.length > 0 && (
				<div className="rounded-md border max-h-48 overflow-y-auto">
					{ownerResults.map((user: any) => (
						<button
							key={user.id}
							type="button"
							className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors border-b last:border-b-0"
							onClick={() => {
								onChange(`${user.full_name || user.email}${user.email ? ` (${user.email})` : ''}`)
								setOwnerSearch('')
								setOwnerResults([])
							}}
						>
							<div className="flex-1 min-w-0">
								<p className="font-medium truncate">{user.full_name || '—'}</p>
								<p className="text-xs text-muted-foreground truncate">{user.email}</p>
							</div>
							{user.designation && (
								<Badge variant="secondary" className="text-xs shrink-0">
									{user.designation}
								</Badge>
							)}
						</button>
					))}
				</div>
			)}
			{ownerSearch.trim().length >= 2 && !ownerLoading && ownerResults.length === 0 && (
				<p className="text-xs text-muted-foreground px-1">
					No users found. You can also type a name directly below.
				</p>
			)}
			<Input
				placeholder="Or type owner name manually..."
				value={value}
				onChange={e => onChange(e.target.value)}
				className="text-sm"
			/>
		</div>
	)
}

// ── Application form data type ────────────────────────────────────────

interface AppFormData {
	name: string
	description: string
	owner: string
	allowed_domains: string[]
	status: 'active' | 'suspended'
	institutions_id: string
}

const DEFAULT_APP_FORM: AppFormData = {
	name: '',
	description: '',
	owner: '',
	allowed_domains: [],
	status: 'active',
	institutions_id: '',
}

// ── ListView ──────────────────────────────────────────────────────────

function ListView({
	onSelectApp,
	onCreateApp,
}: {
	onSelectApp: (app: ApiApplication) => void
	onCreateApp: () => void
}) {
	const { toast } = useToast()

	const [items, setItems] = useState<ApiApplication[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const [searchTerm, setSearchTerm] = useState('')
	const [statusFilter, setStatusFilter] = useState('all')
	const [sortColumn, setSortColumn] = useState<string | null>(null)
	const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
	const [currentPage, setCurrentPage] = useState(1)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [editing, setEditing] = useState<ApiApplication | null>(null)
	const [deleteTarget, setDeleteTarget] = useState<ApiApplication | null>(null)
	const [errors, setErrors] = useState<Record<string, string>>({})
	const [formData, setFormData] = useState<AppFormData>(DEFAULT_APP_FORM)

	const fetchItems = useCallback(async () => {
		try {
			setLoading(true)
			const res = await fetch('/api/developer-portal/applications')
			if (!res.ok) throw new Error('Failed to fetch')
			const data = await res.json()
			setItems(Array.isArray(data) ? data : data.data ?? [])
		} catch (err) {
			console.error(err)
			toast({
				title: 'Error',
				description: 'Failed to load applications',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		fetchItems()
	}, [fetchItems])

	const resetForm = () => {
		setFormData(DEFAULT_APP_FORM)
		setErrors({})
		setEditing(null)
	}

	const openCreate = () => {
		resetForm()
		setSheetOpen(true)
	}

	const openEdit = (item: ApiApplication) => {
		setEditing(item)
		setFormData({
			name: item.name,
			description: item.description ?? '',
			owner: item.owner ?? '',
			allowed_domains: item.allowed_domains ?? [],
			status: item.status,
			institutions_id: item.institutions_id ?? '',
		})
		setErrors({})
		setSheetOpen(true)
	}

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (!formData.name.trim()) e.name = 'Application name is required'
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: 'Validation Error',
				description: 'Please fix all errors before saving',
				variant: 'destructive',
			})
			return
		}

		try {
			setSaving(true)
			const payload = {
				...formData,
				...(editing ? { id: editing.id } : {}),
			}
			const res = await fetch('/api/developer-portal/applications', {
				method: editing ? 'PUT' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Save failed')
			}
			const saved: ApiApplication = await res.json()

			if (editing) {
				setItems(prev => prev.map(x => (x.id === saved.id ? saved : x)))
				toast({
					title: 'Updated',
					description: `${saved.name} saved successfully`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				setSheetOpen(false)
				resetForm()
			} else {
				setItems(prev => [saved, ...prev])
				toast({
					title: 'Created',
					description: `${saved.name} created successfully`,
					className: 'bg-green-50 border-green-200 text-green-800',
				})
				setSheetOpen(false)
				resetForm()
				// Navigate to detail view for the new app
				onSelectApp(saved)
			}
		} catch (err) {
			toast({
				title: 'Save Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		if (!deleteTarget) return
		try {
			const res = await fetch(
				`/api/developer-portal/applications?id=${deleteTarget.id}`,
				{ method: 'DELETE' }
			)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Delete failed')
			}
			setItems(prev => prev.filter(x => x.id !== deleteTarget.id))
			toast({
				title: 'Deleted',
				description: `${deleteTarget.name} removed`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			toast({
				title: 'Delete Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setDeleteTarget(null)
		}
	}

	const handleSort = (col: string) => {
		if (sortColumn === col) {
			setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
		} else {
			setSortColumn(col)
			setSortDir('asc')
		}
	}

	const filtered = useMemo(() => {
		const q = searchTerm.toLowerCase()
		return items
			.filter(item => {
				const matchSearch =
					item.name.toLowerCase().includes(q) ||
					(item.owner ?? '').toLowerCase().includes(q)
				const matchStatus =
					statusFilter === 'all' ||
					(statusFilter === 'active' && item.status === 'active') ||
					(statusFilter === 'suspended' && item.status === 'suspended')
				return matchSearch && matchStatus
			})
			.sort((a, b) => {
				if (!sortColumn) return 0
				const av = String((a as Record<string, unknown>)[sortColumn] ?? '')
				const bv = String((b as Record<string, unknown>)[sortColumn] ?? '')
				const cmp = av.localeCompare(bv)
				return sortDir === 'asc' ? cmp : -cmp
			})
	}, [items, searchTerm, statusFilter, sortColumn, sortDir])

	const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
	const paginated = filtered.slice(
		(currentPage - 1) * ITEMS_PER_PAGE,
		currentPage * ITEMS_PER_PAGE
	)

	const stats = {
		total: items.length,
		active: items.filter(i => i.status === 'active').length,
		suspended: items.filter(i => i.status === 'suspended').length,
		totalApiKeys: 0,
	}

	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	return (
		<>
			{/* Breadcrumb */}
			<Breadcrumb className="-mb-3">
				<BreadcrumbList>
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link href="/dashboard">Dashboard</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbLink asChild>
							<Link href="/developer-portal">Developer Portal</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator />
					<BreadcrumbItem>
						<BreadcrumbPage>Applications</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>

			{/* Stats Cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card className="border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-2xl font-bold tracking-tight">{stats.total}</p>
								<p className="text-xs font-medium text-muted-foreground mt-0.5">Total Applications</p>
							</div>
							<AppWindow className="h-5 w-5 text-blue-500/40" />
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-2xl font-bold tracking-tight">{stats.active}</p>
								<p className="text-xs font-medium text-muted-foreground mt-0.5">Active</p>
							</div>
							<AppWindow className="h-5 w-5 text-emerald-500/40" />
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-amber-500 hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-2xl font-bold tracking-tight">{stats.suspended}</p>
								<p className="text-xs font-medium text-muted-foreground mt-0.5">Suspended</p>
							</div>
							<AppWindow className="h-5 w-5 text-amber-500/40" />
						</div>
					</CardContent>
				</Card>
				<Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
					<CardContent className="p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-2xl font-bold tracking-tight">{stats.totalApiKeys}</p>
								<p className="text-xs font-medium text-muted-foreground mt-0.5">Total API Keys</p>
							</div>
							<Key className="h-5 w-5 text-purple-500/40" />
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Table Card */}
			<Card className="flex-1 flex flex-col min-h-0">
				<CardHeader className="flex-shrink-0 px-4 py-3 border-b">
					<div className="space-y-3">
						{/* Row 1: Title and Action Buttons */}
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
							<div>
								<h2 className="text-base font-semibold">All Applications</h2>
								<p className="text-xs text-muted-foreground">Manage and organize API applications</p>
							</div>
							<div className="flex items-center gap-1.5">
								<Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={fetchItems} title="Refresh">
									<RefreshCw className="h-3.5 w-3.5" />
								</Button>
								<Button size="sm" onClick={onCreateApp} className="h-8 text-sm px-4">
									<PlusCircle className="h-3.5 w-3.5 mr-1.5" />
									Add Application
								</Button>
							</div>
						</div>

						{/* Row 2: Filter and Search Row */}
						<div className="flex items-center gap-2 flex-wrap">
							<Select
								value={statusFilter}
								onValueChange={v => {
									setStatusFilter(v)
									setCurrentPage(1)
								}}
							>
								<SelectTrigger className="h-8 text-sm w-[130px]">
									<SelectValue placeholder="All Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Status</SelectItem>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="suspended">Suspended</SelectItem>
								</SelectContent>
							</Select>

							<div className="relative flex-1 max-w-sm">
								<Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search by name or owner..."
									value={searchTerm}
									onChange={e => {
										setSearchTerm(e.target.value)
										setCurrentPage(1)
									}}
									className="pl-8 h-8 text-sm"
								/>
							</div>
						</div>
					</div>
				</CardHeader>

				<CardContent className="flex-1 overflow-auto p-0">
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-muted/50">
							<TableRow>
								<TableHead className="text-xs font-semibold">
									<Button variant="ghost" size="sm" onClick={() => handleSort('name')} className="px-2 transition-colors">
										Name
										<span className="ml-1">{getSortIcon('name')}</span>
									</Button>
								</TableHead>
								<TableHead className="text-xs font-semibold">
									<Button variant="ghost" size="sm" onClick={() => handleSort('owner')} className="px-2 transition-colors">
										Owner
										<span className="ml-1">{getSortIcon('owner')}</span>
									</Button>
								</TableHead>
								<TableHead className="text-xs font-semibold">
									<Button variant="ghost" size="sm" onClick={() => handleSort('status')} className="px-2 transition-colors">
										Status
										<span className="ml-1">{getSortIcon('status')}</span>
									</Button>
								</TableHead>
								<TableHead className="text-xs font-semibold">
									<Button variant="ghost" size="sm" onClick={() => handleSort('allowed_domains')} className="px-2 transition-colors">
										Domains
										<span className="ml-1">{getSortIcon('allowed_domains')}</span>
									</Button>
								</TableHead>
								<TableHead className="text-xs font-semibold">
									<Button variant="ghost" size="sm" onClick={() => handleSort('created_at')} className="px-2 transition-colors">
										Created
										<span className="ml-1">{getSortIcon('created_at')}</span>
									</Button>
								</TableHead>
								<TableHead className="text-center text-xs font-semibold">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={6} className="h-24 text-center">
										<div className="flex items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-5 w-5 animate-spin" />
											<span className="text-sm">Loading applications...</span>
										</div>
									</TableCell>
								</TableRow>
							) : paginated.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className="h-24 text-center">
										<div className="flex flex-col items-center gap-1 text-muted-foreground">
											<AppWindow className="h-8 w-8 opacity-20" />
											<span className="text-sm font-medium">No applications found</span>
											<span className="text-xs">Try adjusting your filters or add a new application</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								paginated.map(item => (
									<TableRow
										key={item.id}
										className="cursor-pointer hover:bg-accent/40"
										onClick={() => onSelectApp(item)}
									>
										<TableCell className="font-medium text-sm">{item.name}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{item.owner ?? '—'}
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className={
													item.status === 'active'
														? 'text-xs bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
														: 'text-xs bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400'
												}
											>
												{item.status}
											</Badge>
										</TableCell>
										<TableCell>
											{item.allowed_domains && item.allowed_domains.length > 0 ? (
												<div className="flex flex-wrap gap-1 max-w-[200px]">
													{item.allowed_domains.slice(0, 2).map(d => (
														<Badge key={d} variant="secondary" className="text-xs">
															{d}
														</Badge>
													))}
													{item.allowed_domains.length > 2 && (
														<Badge variant="outline" className="text-xs">
															+{item.allowed_domains.length - 2}
														</Badge>
													)}
												</div>
											) : (
												<span className="text-muted-foreground text-sm">—</span>
											)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatDate(item.created_at)}
										</TableCell>
										<TableCell
											className="text-center"
											onClick={e => e.stopPropagation()}
										>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => onSelectApp(item)}
												title="View / Edit"
											>
												<Pencil className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 w-7 p-0"
												onClick={() => setDeleteTarget(item)}
												title="Delete"
											>
												<Trash2 className="h-4 w-4 text-red-500" />
											</Button>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>

				{/* Pagination */}
				<div className="flex items-center justify-between pt-3 px-4 pb-3 border-t">
					<div className="text-sm text-muted-foreground">
						{filtered.length === 0
							? 'No results'
							: `Showing ${(currentPage - 1) * ITEMS_PER_PAGE + 1}–${Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of ${filtered.length} applications`}
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage === 1}
							onClick={() => setCurrentPage(p => p - 1)}
							className="h-7 px-3"
						>
							Previous
						</Button>
						<span className="text-sm text-muted-foreground">
							Page {currentPage} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							disabled={currentPage >= totalPages}
							onClick={() => setCurrentPage(p => p + 1)}
							className="h-7 px-3"
						>
							Next
						</Button>
					</div>
				</div>
			</Card>

			{/* Create / Edit Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={open => {
					if (!open) resetForm()
					setSheetOpen(open)
				}}
			>
				<SheetContent className="sm:max-w-[600px] overflow-y-auto">
					<SheetHeader>
						<SheetTitle>
							{editing ? 'Edit Application' : 'Add New Application'}
						</SheetTitle>
					</SheetHeader>

					<div className="space-y-5 mt-6">
						{/* Name */}
						<div className="space-y-2">
							<Label htmlFor="app-name">
								Application Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id="app-name"
								placeholder="My Integration App"
								value={formData.name}
								onChange={e => setFormData({ ...formData, name: e.target.value })}
								className={errors.name ? 'border-red-500' : ''}
							/>
							{errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
						</div>

						{/* Description */}
						<div className="space-y-2">
							<Label htmlFor="app-desc">Description</Label>
							<Textarea
								id="app-desc"
								placeholder="Brief description of this application..."
								rows={3}
								value={formData.description}
								onChange={e => setFormData({ ...formData, description: e.target.value })}
							/>
						</div>

						{/* Owner */}
						<div className="space-y-2">
							<Label>Owner / Contact</Label>
							<OwnerField
								value={formData.owner}
								onChange={v => setFormData({ ...formData, owner: v })}
							/>
						</div>

						{/* Allowed Domains */}
						<div className="space-y-2">
							<Label>Allowed Domains</Label>
							<p className="text-xs text-muted-foreground">
								Type domain(s) separated by commas and press Enter or click Add.
								Leave empty to allow all domains.
							</p>
							<DomainTagInput
								domains={formData.allowed_domains}
								onChange={d => setFormData({ ...formData, allowed_domains: d })}
							/>
						</div>

						{/* Status */}
						<div className="space-y-2">
							<Label>Status</Label>
							<div className="flex items-center gap-3">
								<Switch
									id="app-status"
									checked={formData.status === 'active'}
									onCheckedChange={checked =>
										setFormData({ ...formData, status: checked ? 'active' : 'suspended' })
									}
								/>
								<Label htmlFor="app-status" className="cursor-pointer">
									{formData.status === 'active' ? 'Active' : 'Suspended'}
								</Label>
							</div>
						</div>

						{/* Actions */}
						<div className="flex gap-3 pt-2">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => setSheetOpen(false)}
							>
								Cancel
							</Button>
							<Button className="flex-1" onClick={handleSave} disabled={saving}>
								{saving ? (
									<>
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										Saving...
									</>
								) : editing ? (
									'Update'
								) : (
									'Create'
								)}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Delete Confirmation */}
			<AlertDialog
				open={!!deleteTarget}
				onOpenChange={open => !open && setDeleteTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Application</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete{' '}
							<strong>{deleteTarget?.name}</strong>? This will also delete all
							associated API keys and permissions. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-red-600 hover:bg-red-700"
							onClick={handleDelete}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}

// ── DetailsTab ────────────────────────────────────────────────────────

function DetailsTab({
	app,
	onUpdated,
	onDeleted,
}: {
	app: ApiApplication | null
	onUpdated: (updated: ApiApplication) => void
	onDeleted: () => void
}) {
	const { toast } = useToast()
	const [saving, setSaving] = useState(false)
	const [deleteOpen, setDeleteOpen] = useState(false)
	const [formData, setFormData] = useState<AppFormData>({
		name: app?.name ?? '',
		description: app?.description ?? '',
		owner: app?.owner ?? '',
		allowed_domains: app?.allowed_domains ?? [],
		status: app?.status ?? 'active',
		institutions_id: app?.institutions_id ?? '',
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	const isNew = !app

	const validate = (): boolean => {
		const e: Record<string, string> = {}
		if (!formData.name.trim()) e.name = 'Application name is required'
		if (!formData.owner.trim()) e.owner = 'Owner / Contact is required'
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: 'Validation Error',
				description: 'Please fix all errors before saving',
				variant: 'destructive',
			})
			return
		}

		try {
			setSaving(true)
			const res = await fetch('/api/developer-portal/applications', {
				method: isNew ? 'POST' : 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(isNew ? formData : { id: app.id, ...formData }),
			})
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Save failed')
			}
			const saved: ApiApplication = await res.json()
			onUpdated(saved)
			toast({
				title: isNew ? 'Created' : 'Updated',
				description: `${saved.name} ${isNew ? 'created' : 'saved'} successfully`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			toast({
				title: 'Save Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	const handleDelete = async () => {
		try {
			const res = await fetch(
				`/api/developer-portal/applications?id=${app.id}`,
				{ method: 'DELETE' }
			)
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Delete failed')
			}
			toast({
				title: 'Deleted',
				description: `${app.name} removed`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
			onDeleted()
		} catch (err) {
			toast({
				title: 'Delete Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setDeleteOpen(false)
		}
	}

	return (
		<div className="space-y-6 py-4">
			{/* Name */}
			<div className="space-y-2">
				<Label htmlFor="detail-name">
					Application Name <span className="text-red-500">*</span>
				</Label>
				<Input
					id="detail-name"
					value={formData.name}
					onChange={e => setFormData({ ...formData, name: e.target.value })}
					className={errors.name ? 'border-red-500' : ''}
				/>
				{errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
			</div>

			{/* Description */}
			<div className="space-y-2">
				<Label htmlFor="detail-desc">Description</Label>
				<Textarea
					id="detail-desc"
					rows={3}
					value={formData.description}
					onChange={e => setFormData({ ...formData, description: e.target.value })}
					placeholder="Brief description of this application..."
				/>
			</div>

			{/* Owner */}
			<div className="space-y-2">
				<Label>Owner / Contact <span className="text-red-500">*</span></Label>
				<OwnerField
					value={formData.owner}
					onChange={v => setFormData({ ...formData, owner: v })}
				/>
				{errors.owner && <p className="text-xs text-red-500">{errors.owner}</p>}
			</div>

			{/* Allowed Domains */}
			<div className="space-y-2">
				<Label>Allowed Domains</Label>
				<p className="text-xs text-muted-foreground">
					Leave empty to allow all domains.
				</p>
				<DomainTagInput
					domains={formData.allowed_domains}
					onChange={d => setFormData({ ...formData, allowed_domains: d })}
				/>
			</div>

			{/* Status */}
			<div className="space-y-2">
				<Label>Status</Label>
				<div className="flex items-center gap-3">
					<Switch
						id="detail-status"
						checked={formData.status === 'active'}
						onCheckedChange={checked =>
							setFormData({ ...formData, status: checked ? 'active' : 'suspended' })
						}
					/>
					<Label htmlFor="detail-status" className="cursor-pointer">
						{formData.status === 'active' ? 'Active' : 'Suspended'}
					</Label>
				</div>
			</div>

			{/* Save */}
			<div className="flex justify-end">
				<Button onClick={handleSave} disabled={saving}>
					{saving ? (
						<>
							<Loader2 className="h-4 w-4 mr-2 animate-spin" />
							{isNew ? 'Creating...' : 'Saving...'}
						</>
					) : (
						<>
							{isNew ? <Plus className="h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
							{isNew ? 'Add Application' : 'Save Changes'}
						</>
					)}
				</Button>
			</div>

		</div>
	)
}

// ── ApiKeysTab ────────────────────────────────────────────────────────

function ApiKeysTab({ app }: { app: ApiApplication }) {
	const { toast } = useToast()

	const [keys, setKeys] = useState<ApiKey[]>([])
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const [sheetOpen, setSheetOpen] = useState(false)
	const [keyName, setKeyName] = useState('')
	const [expiresAt, setExpiresAt] = useState('')
	const [keyErrors, setKeyErrors] = useState<Record<string, string>>({})

	const [secretModal, setSecretModal] = useState(false)
	const [newKeyData, setNewKeyData] = useState<ApiKeyCreateResponse | null>(null)

	const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null)
	const [regenerateTarget, setRegenerateTarget] = useState<ApiKey | null>(null)

	const fetchKeys = useCallback(async () => {
		try {
			setLoading(true)
			const res = await fetch(`/api/developer-portal/api-keys?app_id=${app.id}`)
			if (!res.ok) throw new Error('Failed to fetch')
			const data = await res.json()
			setKeys(Array.isArray(data) ? data : data.data ?? [])
		} catch (err) {
			console.error(err)
			toast({
				title: 'Error',
				description: 'Failed to load API keys',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [app.id])

	useEffect(() => {
		fetchKeys()
	}, [fetchKeys])

	const resetKeyForm = () => {
		setKeyName('')
		setExpiresAt('')
		setKeyErrors({})
	}

	const validateKey = (): boolean => {
		const e: Record<string, string> = {}
		if (!keyName.trim()) e.keyName = 'Key name is required'
		setKeyErrors(e)
		return Object.keys(e).length === 0
	}

	const handleGenerate = async () => {
		if (!validateKey()) {
			toast({
				title: 'Validation Error',
				description: 'Please fix all errors before generating',
				variant: 'destructive',
			})
			return
		}

		try {
			setSaving(true)
			const payload: Record<string, unknown> = {
				app_id: app.id,
				key_name: keyName.trim(),
			}
			if (expiresAt) payload.expires_at = expiresAt

			const res = await fetch('/api/developer-portal/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Generation failed')
			}

			const created: ApiKeyCreateResponse = await res.json()

			const keyRecord: ApiKey = {
				id: created.id,
				app_id: created.app_id,
				access_key_id: created.access_key_id,
				secret_key_hash: '***',
				key_name: created.key_name,
				status: 'active',
				expires_at: created.expires_at ?? null,
				last_used_at: null,
				created_at: created.created_at,
			}
			setKeys(prev => [keyRecord, ...prev])

			setSheetOpen(false)
			resetKeyForm()
			setNewKeyData(created)
			setSecretModal(true)
		} catch (err) {
			toast({
				title: 'Generation Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	const handleRevoke = async () => {
		if (!revokeTarget) return
		try {
			const res = await fetch('/api/developer-portal/api-keys', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: revokeTarget.id, status: 'revoked' }),
			})
			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Revoke failed')
			}
			setKeys(prev =>
				prev.map(k => (k.id === revokeTarget.id ? { ...k, status: 'revoked' } : k))
			)
			toast({
				title: 'Revoked',
				description: `Key "${revokeTarget.key_name}" has been revoked`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})
		} catch (err) {
			toast({
				title: 'Revoke Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setRevokeTarget(null)
		}
	}

	const handleRegenerate = async () => {
		if (!regenerateTarget) return
		try {
			setSaving(true)
			// Revoke the old key
			await fetch('/api/developer-portal/api-keys', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: regenerateTarget.id, status: 'revoked' }),
			})

			// Create a new key with the same name
			const payload: Record<string, unknown> = {
				app_id: app.id,
				key_name: `${regenerateTarget.key_name} (regenerated)`,
			}
			if (regenerateTarget.expires_at) payload.expires_at = regenerateTarget.expires_at

			const res = await fetch('/api/developer-portal/api-keys', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})

			if (!res.ok) {
				const err = await res.json()
				throw new Error(err.error ?? 'Regeneration failed')
			}

			const created: ApiKeyCreateResponse = await res.json()

			const keyRecord: ApiKey = {
				id: created.id,
				app_id: created.app_id,
				access_key_id: created.access_key_id,
				secret_key_hash: '***',
				key_name: created.key_name,
				status: 'active',
				expires_at: created.expires_at ?? null,
				last_used_at: null,
				created_at: created.created_at,
			}

			setKeys(prev => [
				keyRecord,
				...prev.map(k =>
					k.id === regenerateTarget.id ? { ...k, status: 'revoked' as const } : k
				),
			])

			setRegenerateTarget(null)
			setNewKeyData(created)
			setSecretModal(true)
		} catch (err) {
			toast({
				title: 'Regeneration Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
			setRegenerateTarget(null)
		}
	}

	return (
		<div className="space-y-4 py-4">
			{/* Controls */}
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{keys.length} key{keys.length !== 1 ? 's' : ''} for this application
				</p>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={fetchKeys} title="Refresh">
						<RefreshCw className="h-4 w-4" />
					</Button>
					<Button
						size="sm"
						onClick={() => {
							resetKeyForm()
							setSheetOpen(true)
						}}
					>
						<Plus className="h-4 w-4 mr-1.5" />
						Generate Key
					</Button>
				</div>
			</div>

			{/* Table */}
			<div className="rounded-md border overflow-hidden">
				<div className="overflow-y-auto max-h-[400px]">
					<Table>
						<TableHeader className="sticky top-0 z-10 bg-background">
							<TableRow>
								<TableHead>Key Name</TableHead>
								<TableHead>Access Key ID</TableHead>
								<TableHead>Status</TableHead>
								<TableHead>Expires</TableHead>
								<TableHead>Last Used</TableHead>
								<TableHead>Created</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={7} className="text-center py-10">
										<Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
									</TableCell>
								</TableRow>
							) : keys.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
										No API keys yet. Generate one to get started.
									</TableCell>
								</TableRow>
							) : (
								keys.map(key => (
									<TableRow key={key.id}>
										<TableCell className="font-medium">{key.key_name}</TableCell>
										<TableCell className="font-mono text-sm text-muted-foreground">
											{key.access_key_id.slice(0, 16)}...
										</TableCell>
										<TableCell>
											<Badge variant="outline" className={statusBadgeClass(key.status)}>
												{key.status}
											</Badge>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDate(key.expires_at)}
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDate(key.last_used_at)}
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDate(key.created_at)}
										</TableCell>
										<TableCell className="text-right">
											<div className="flex items-center justify-end gap-1">
												{key.status === 'active' && (
													<>
														<Button
															variant="ghost"
															size="sm"
															className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 text-xs"
															onClick={() => setRegenerateTarget(key)}
															title="Regenerate key"
														>
															<RefreshCw className="h-3.5 w-3.5 mr-1" />
															Regen
														</Button>
														<Button
															variant="ghost"
															size="sm"
															className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs"
															onClick={() => setRevokeTarget(key)}
															title="Revoke key"
														>
															<XCircle className="h-3.5 w-3.5 mr-1" />
															Revoke
														</Button>
													</>
												)}
											</div>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Generate Key Sheet */}
			<Sheet
				open={sheetOpen}
				onOpenChange={open => {
					if (!open) resetKeyForm()
					setSheetOpen(open)
				}}
			>
				<SheetContent className="sm:max-w-[480px] overflow-y-auto">
					<SheetHeader>
						<SheetTitle className="flex items-center gap-2">
							<Key className="h-5 w-5" />
							Generate New API Key
						</SheetTitle>
					</SheetHeader>

					<div className="space-y-5 mt-6">
						<div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
							Application: <strong className="text-foreground">{app.name}</strong>
						</div>

						<div className="space-y-2">
							<Label htmlFor="key-name">
								Key Name <span className="text-red-500">*</span>
							</Label>
							<Input
								id="key-name"
								placeholder="e.g. Production Key, Dev Key"
								value={keyName}
								onChange={e => setKeyName(e.target.value)}
								className={keyErrors.keyName ? 'border-red-500' : ''}
							/>
							{keyErrors.keyName && (
								<p className="text-sm text-red-500">{keyErrors.keyName}</p>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="key-expiry">Expiry Date (optional)</Label>
							<Input
								id="key-expiry"
								type="date"
								value={expiresAt}
								onChange={e => setExpiresAt(e.target.value)}
								min={new Date().toISOString().split('T')[0]}
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty for a non-expiring key
							</p>
						</div>

						<div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20 p-3">
							<p className="text-sm text-yellow-800 dark:text-yellow-300 flex items-start gap-2">
								<AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
								The secret key will be shown only once after creation. Make sure to
								copy and store it safely.
							</p>
						</div>

						<div className="flex gap-3 pt-2">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => setSheetOpen(false)}
							>
								Cancel
							</Button>
							<Button className="flex-1" onClick={handleGenerate} disabled={saving}>
								{saving ? (
									<>
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										Generating...
									</>
								) : (
									<>
										<Key className="h-4 w-4 mr-2" />
										Generate Key
									</>
								)}
							</Button>
						</div>
					</div>
				</SheetContent>
			</Sheet>

			{/* Secret Key Modal */}
			<SecretKeyModal
				open={secretModal}
				onClose={() => {
					setSecretModal(false)
					setNewKeyData(null)
				}}
				keyData={newKeyData}
			/>

			{/* Revoke Confirmation */}
			<AlertDialog
				open={!!revokeTarget}
				onOpenChange={open => !open && setRevokeTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke API Key</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to revoke{' '}
							<strong>{revokeTarget?.key_name}</strong>? Any applications using this
							key will immediately lose access. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-red-600 hover:bg-red-700"
							onClick={handleRevoke}
						>
							Revoke Key
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Regenerate Confirmation */}
			<AlertDialog
				open={!!regenerateTarget}
				onOpenChange={open => !open && setRegenerateTarget(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Regenerate API Key</AlertDialogTitle>
						<AlertDialogDescription>
							This will revoke{' '}
							<strong>{regenerateTarget?.key_name}</strong> and generate a new key.
							Any applications using the old key will immediately lose access.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-orange-600 hover:bg-orange-700"
							onClick={handleRegenerate}
						>
							{saving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Regenerating...
								</>
							) : (
								'Regenerate'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}

// ── PermissionsTab ────────────────────────────────────────────────────

function PermissionsTab({ app }: { app: ApiApplication }) {
	const { toast } = useToast()

	const [checked, setChecked] = useState<Set<string>>(new Set())
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	const fetchPermissions = useCallback(async () => {
		try {
			setLoading(true)
			const res = await fetch(`/api/developer-portal/permissions?app_id=${app.id}`)
			if (!res.ok) throw new Error('Failed to fetch permissions')
			const data = await res.json()
			const perms: ApiPermission[] = Array.isArray(data) ? data : data.data ?? []
			const keys = new Set(
				perms.map(p => permKey(p.module as ApiModule, p.operation as ApiOperation))
			)
			setChecked(keys)
		} catch (err) {
			console.error(err)
			toast({
				title: 'Error',
				description: 'Failed to load permissions',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}, [app.id])

	useEffect(() => {
		fetchPermissions()
	}, [fetchPermissions])

	const toggle = (module: ApiModule, op: ApiOperation) => {
		const key = permKey(module, op)
		setChecked(prev => {
			const next = new Set(prev)
			if (next.has(key)) {
				next.delete(key)
			} else {
				next.add(key)
			}
			return next
		})
	}

	const toggleRow = (module: ApiModule) => {
		const allKeys = API_OPERATIONS.map(op => permKey(module, op))
		const allChecked = allKeys.every(k => checked.has(k))
		setChecked(prev => {
			const next = new Set(prev)
			if (allChecked) {
				allKeys.forEach(k => next.delete(k))
			} else {
				allKeys.forEach(k => next.add(k))
			}
			return next
		})
	}

	const toggleColumn = (op: ApiOperation) => {
		const allKeys = API_MODULES.map(m => permKey(m, op))
		const allChecked = allKeys.every(k => checked.has(k))
		setChecked(prev => {
			const next = new Set(prev)
			if (allChecked) {
				allKeys.forEach(k => next.delete(k))
			} else {
				allKeys.forEach(k => next.add(k))
			}
			return next
		})
	}

	const selectAll = () => {
		const all = new Set<string>()
		API_MODULES.forEach(m => API_OPERATIONS.forEach(op => all.add(permKey(m, op))))
		setChecked(all)
	}

	const selectNone = () => setChecked(new Set())

	const handleSave = async () => {
		try {
			setSaving(true)

			// Step 1: Delete all existing permissions
			const delRes = await fetch(
				`/api/developer-portal/permissions?app_id=${app.id}`,
				{ method: 'DELETE' }
			)
			if (!delRes.ok) {
				const err = await delRes.json()
				throw new Error(err.error ?? 'Failed to clear old permissions')
			}

			// Step 2: Insert all checked permissions
			const permissions = Array.from(checked).map(key => {
				const [module, operation] = key.split(':') as [ApiModule, ApiOperation]
				return { module, operation }
			})

			if (permissions.length > 0) {
				const res = await fetch('/api/developer-portal/permissions', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ app_id: app.id, permissions }),
				})
				if (!res.ok) {
					const err = await res.json()
					throw new Error(err.error ?? 'Save failed')
				}
			}

			toast({
				title: 'Permissions Saved',
				description: `${permissions.length} permission${permissions.length !== 1 ? 's' : ''} saved successfully`,
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			await fetchPermissions()
		} catch (err) {
			toast({
				title: 'Save Failed',
				description: err instanceof Error ? err.message : 'Please try again',
				variant: 'destructive',
			})
		} finally {
			setSaving(false)
		}
	}

	const totalChecked = checked.size
	const totalPossible = API_MODULES.length * API_OPERATIONS.length

	return (
		<div className="space-y-4 py-4">
			{/* Controls */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<Info className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm text-muted-foreground">
						{totalChecked} of {totalPossible} permissions granted
					</span>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="sm" onClick={selectAll}>
						Select All
					</Button>
					<Button variant="outline" size="sm" onClick={selectNone}>
						Clear All
					</Button>
					<Button
						size="sm"
						onClick={handleSave}
						disabled={saving || loading}
					>
						{saving ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>
								<Save className="h-4 w-4 mr-2" />
								Save Permissions
							</>
						)}
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="flex items-center justify-center py-16">
					<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
				</div>
			) : (
				<div className="rounded-md border overflow-hidden">
					<Table>
						<TableHeader className="bg-muted/50">
							<TableRow>
								<TableHead className="w-[180px] font-semibold">Module</TableHead>
								{API_OPERATIONS.map(op => (
									<TableHead key={op} className="text-center">
										<div className="flex flex-col items-center gap-1">
											<Badge
												variant="outline"
												className={`text-xs ${OPERATION_COLORS[op]}`}
											>
												{OPERATION_LABELS[op]}
											</Badge>
											<button
												type="button"
												className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
												onClick={() => toggleColumn(op)}
												title={`Toggle all ${op}`}
											>
												all
											</button>
										</div>
									</TableHead>
								))}
								<TableHead className="text-center w-[80px]">All</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{API_MODULES.map((module, idx) => {
								const rowKeys = API_OPERATIONS.map(op => permKey(module, op))
								const allRowChecked = rowKeys.every(k => checked.has(k))
								const someRowChecked = rowKeys.some(k => checked.has(k))

								return (
									<TableRow
										key={module}
										className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
									>
										<TableCell className="font-medium">
											{MODULE_LABELS[module]}
											<p className="text-xs text-muted-foreground font-normal font-mono mt-0.5">
												{module}
											</p>
										</TableCell>

										{API_OPERATIONS.map(op => {
											const key = permKey(module, op)
											const isChecked = checked.has(key)
											return (
												<TableCell key={op} className="text-center">
													<Checkbox
														checked={isChecked}
														onCheckedChange={() => toggle(module, op)}
														aria-label={`${MODULE_LABELS[module]} - ${OPERATION_LABELS[op]}`}
														className="mx-auto"
													/>
												</TableCell>
											)
										})}

										<TableCell className="text-center">
											<Checkbox
												checked={allRowChecked}
												data-state={
													allRowChecked
														? 'checked'
														: someRowChecked
														? 'indeterminate'
														: 'unchecked'
												}
												onCheckedChange={() => toggleRow(module)}
												aria-label={`Toggle all ${MODULE_LABELS[module]}`}
												className="mx-auto"
											/>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Save button (bottom) */}
			{!loading && (
				<div className="flex justify-end">
					<Button onClick={handleSave} disabled={saving}>
						{saving ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Saving...
							</>
						) : (
							<>
								<Save className="h-4 w-4 mr-2" />
								Save Permissions
							</>
						)}
					</Button>
				</div>
			)}
		</div>
	)
}

// ── DetailView ────────────────────────────────────────────────────────

function DetailView({
	app,
	onBack,
	onUpdated,
	onDeleted,
}: {
	app: ApiApplication | null
	onBack: () => void
	onUpdated: (updated: ApiApplication) => void
	onDeleted: () => void
}) {
	const isNew = !app

	return (
		<div className="space-y-6">
			{/* Back + heading */}
			<div className="flex items-start gap-4">
				<Button variant="outline" size="sm" onClick={onBack}>
					<ArrowLeft className="h-4 w-4 mr-1.5" />
					Back to Applications
				</Button>
			</div>

			<div className="flex items-center gap-3">
				<AppWindow className="h-7 w-7 text-muted-foreground" />
				<div>
					<h1 className="text-3xl font-bold font-heading leading-tight">
						{isNew ? 'New Application' : app.name}
					</h1>
					{!isNew && app.description && (
						<p className="text-muted-foreground text-sm mt-0.5">{app.description}</p>
					)}
				</div>
				{!isNew && (
					<Badge
						variant="outline"
						className={
							app.status === 'active'
								? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:text-green-400 ml-auto'
								: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:text-red-400 ml-auto'
						}
					>
						{app.status}
					</Badge>
				)}
			</div>

			{/* Tabs */}
			<Tabs defaultValue="details">
				<TabsList className="bg-gradient-to-r from-slate-100 via-blue-50 to-purple-50 dark:from-slate-800 dark:via-blue-950/40 dark:to-purple-950/40 border border-slate-200/60 dark:border-slate-700/60 p-1 rounded-xl shadow-sm">
					<TabsTrigger value="details" className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-blue-700 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-blue-400 transition-all duration-200">
						<Pencil className="h-3.5 w-3.5" />
						Details
					</TabsTrigger>
					<TabsTrigger value="api-keys" disabled={isNew} className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-emerald-700 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-emerald-400 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
						<Key className="h-3.5 w-3.5" />
						API Keys
					</TabsTrigger>
					<TabsTrigger value="permissions" disabled={isNew} className="flex items-center gap-1.5 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-purple-700 dark:data-[state=active]:bg-slate-800 dark:data-[state=active]:text-purple-400 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
						<Shield className="h-3.5 w-3.5" />
						Permissions
					</TabsTrigger>
				</TabsList>

				<TabsContent value="details">
					<DetailsTab app={app} onUpdated={onUpdated} onDeleted={onDeleted} />
				</TabsContent>

				{!isNew && (
					<>
						<TabsContent value="api-keys">
							<ApiKeysTab app={app} />
						</TabsContent>

						<TabsContent value="permissions">
							<PermissionsTab app={app} />
						</TabsContent>
					</>
				)}
			</Tabs>
		</div>
	)
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ApplicationsPage() {
	// 'list' = app list, 'detail' = existing app, 'create' = new app
	const [view, setView] = useState<'list' | 'detail' | 'create'>('list')
	const [selectedApp, setSelectedApp] = useState<ApiApplication | null>(null)

	const handleSelectApp = (app: ApiApplication) => {
		setSelectedApp(app)
		setView('detail')
	}

	const handleCreate = () => {
		setSelectedApp(null)
		setView('create')
	}

	const handleBack = () => {
		setSelectedApp(null)
		setView('list')
	}

	const handleUpdated = (updated: ApiApplication) => {
		setSelectedApp(updated)
		setView('detail')
	}

	const handleDeleted = () => {
		setSelectedApp(null)
		setView('list')
	}

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader />
				<main className="flex-1 px-6 pt-2 pb-6 space-y-6">
					{view === 'list' ? (
						<ListView onSelectApp={handleSelectApp} onCreateApp={handleCreate} />
					) : (
						<DetailView
							app={selectedApp}
							onBack={handleBack}
							onUpdated={handleUpdated}
							onDeleted={handleDeleted}
						/>
					)}
				</main>
				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
