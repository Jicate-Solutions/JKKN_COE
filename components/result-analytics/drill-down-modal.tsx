"use client"

import { useState, useMemo } from "react"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Search,
	Download,
	Users,
	GraduationCap,
	TrendingUp,
	TrendingDown,
	CheckCircle2,
	XCircle,
	AlertCircle,
	BarChart3,
	Star,
	ChevronRight,
	Filter,
	SortAsc,
	SortDesc,
	FileSpreadsheet
} from "lucide-react"
import { cn } from "@/lib/utils"

interface LearnerRecord {
	id: string
	registerNumber: string
	name: string
	program: string
	semester: number
	cgpa: number
	percentage: number
	status: 'passed' | 'failed' | 'distinction' | 'first_class' | 'second_class'
	backlogs: number
	gender?: string
}

interface DrillDownModalProps {
	open: boolean
	onClose: () => void
	title: string
	subtitle?: string
	data: LearnerRecord[]
	summary: {
		total: number
		passed: number
		failed: number
		avgCGPA: number
		avgPercentage: number
		distinctionCount: number
	}
	onExport?: () => void
}

type SortField = 'name' | 'registerNumber' | 'cgpa' | 'percentage' | 'backlogs'
type SortDirection = 'asc' | 'desc'

function getStatusBadge(status: LearnerRecord['status']) {
	switch (status) {
		case 'distinction':
			return (
				<Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
					<Star className="h-3 w-3 mr-1 fill-amber-500" />
					Distinction
				</Badge>
			)
		case 'first_class':
			return (
				<Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
					<CheckCircle2 className="h-3 w-3 mr-1" />
					First Class
				</Badge>
			)
		case 'second_class':
			return (
				<Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
					<CheckCircle2 className="h-3 w-3 mr-1" />
					Second Class
				</Badge>
			)
		case 'passed':
			return (
				<Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">
					<CheckCircle2 className="h-3 w-3 mr-1" />
					Passed
				</Badge>
			)
		case 'failed':
			return (
				<Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0">
					<XCircle className="h-3 w-3 mr-1" />
					Needs Support
				</Badge>
			)
	}
}

export function DrillDownModal({
	open,
	onClose,
	title,
	subtitle,
	data,
	summary,
	onExport
}: DrillDownModalProps) {
	const [searchQuery, setSearchQuery] = useState("")
	const [statusFilter, setStatusFilter] = useState<string>("all")
	const [sortField, setSortField] = useState<SortField>('percentage')
	const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

	const filteredAndSortedData = useMemo(() => {
		let filtered = data

		// Apply search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase()
			filtered = filtered.filter(
				r =>
					r.name.toLowerCase().includes(query) ||
					r.registerNumber.toLowerCase().includes(query) ||
					r.program.toLowerCase().includes(query)
			)
		}

		// Apply status filter
		if (statusFilter !== "all") {
			filtered = filtered.filter(r => r.status === statusFilter)
		}

		// Apply sorting
		filtered = [...filtered].sort((a, b) => {
			let comparison = 0
			switch (sortField) {
				case 'name':
					comparison = a.name.localeCompare(b.name)
					break
				case 'registerNumber':
					comparison = a.registerNumber.localeCompare(b.registerNumber)
					break
				case 'cgpa':
					comparison = a.cgpa - b.cgpa
					break
				case 'percentage':
					comparison = a.percentage - b.percentage
					break
				case 'backlogs':
					comparison = a.backlogs - b.backlogs
					break
			}
			return sortDirection === 'desc' ? -comparison : comparison
		})

		return filtered
	}, [data, searchQuery, statusFilter, sortField, sortDirection])

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
		} else {
			setSortField(field)
			setSortDirection('desc')
		}
	}

	const SortIcon = sortDirection === 'asc' ? SortAsc : SortDesc

	return (
		<Dialog open={open} onOpenChange={() => onClose()}>
			<DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-lg">
						<Users className="h-5 w-5 text-indigo-500" />
						{title}
					</DialogTitle>
					{subtitle && (
						<DialogDescription>{subtitle}</DialogDescription>
					)}
				</DialogHeader>

				{/* Summary Cards */}
				<div className="grid grid-cols-6 gap-3 py-3">
					<div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-center">
						<p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Total</p>
						<p className="text-xl font-bold text-slate-900 dark:text-slate-100">{summary.total.toLocaleString()}</p>
					</div>
					<div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-center">
						<p className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-semibold">Passed</p>
						<p className="text-xl font-bold text-green-700 dark:text-green-300">{summary.passed.toLocaleString()}</p>
					</div>
					<div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-center">
						<p className="text-[10px] uppercase tracking-wider text-red-600 dark:text-red-400 font-semibold">Need Support</p>
						<p className="text-xl font-bold text-red-700 dark:text-red-300">{summary.failed.toLocaleString()}</p>
					</div>
					<div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-center">
						<p className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">Distinctions</p>
						<p className="text-xl font-bold text-amber-700 dark:text-amber-300">{summary.distinctionCount}</p>
					</div>
					<div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-center">
						<p className="text-[10px] uppercase tracking-wider text-blue-600 dark:text-blue-400 font-semibold">Avg CGPA</p>
						<p className="text-xl font-bold text-blue-700 dark:text-blue-300">{summary.avgCGPA.toFixed(2)}</p>
					</div>
					<div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-center">
						<p className="text-[10px] uppercase tracking-wider text-purple-600 dark:text-purple-400 font-semibold">Avg %</p>
						<p className="text-xl font-bold text-purple-700 dark:text-purple-300">{summary.avgPercentage.toFixed(1)}%</p>
					</div>
				</div>

				{/* Filters Row */}
				<div className="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-700">
					<div className="relative flex-1 max-w-sm">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
						<Input
							placeholder="Search by name, register number, or program..."
							className="pl-9 h-9 text-sm"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					<div className="flex items-center gap-2">
						<Filter className="h-4 w-4 text-slate-400" />
						<div className="flex gap-1">
							{["all", "distinction", "first_class", "passed", "failed"].map((status) => (
								<Button
									key={status}
									variant={statusFilter === status ? "default" : "outline"}
									size="sm"
									className="h-7 text-xs"
									onClick={() => setStatusFilter(status)}
								>
									{status === "all" ? "All" : status === "first_class" ? "1st Class" : status.charAt(0).toUpperCase() + status.slice(1)}
								</Button>
							))}
						</div>
					</div>

					{onExport && (
						<Button variant="outline" size="sm" onClick={onExport} className="h-8">
							<FileSpreadsheet className="h-4 w-4 mr-1.5" />
							Export
						</Button>
					)}
				</div>

				{/* Results Info */}
				<div className="flex items-center justify-between py-2 text-xs text-slate-500">
					<span>
						Showing {filteredAndSortedData.length} of {data.length} learners
					</span>
					<span>
						Click column headers to sort
					</span>
				</div>

				{/* Data Table */}
				<ScrollArea className="flex-1 -mx-6 px-6">
					<Table>
						<TableHeader>
							<TableRow className="bg-slate-50 dark:bg-slate-800/50">
								<TableHead
									className="cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
									onClick={() => handleSort('registerNumber')}
								>
									<div className="flex items-center gap-1">
										Reg. No.
										{sortField === 'registerNumber' && <SortIcon className="h-3 w-3" />}
									</div>
								</TableHead>
								<TableHead
									className="cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
									onClick={() => handleSort('name')}
								>
									<div className="flex items-center gap-1">
										Name
										{sortField === 'name' && <SortIcon className="h-3 w-3" />}
									</div>
								</TableHead>
								<TableHead>Program</TableHead>
								<TableHead className="text-center">Sem</TableHead>
								<TableHead
									className="text-center cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
									onClick={() => handleSort('cgpa')}
								>
									<div className="flex items-center justify-center gap-1">
										CGPA
										{sortField === 'cgpa' && <SortIcon className="h-3 w-3" />}
									</div>
								</TableHead>
								<TableHead
									className="text-center cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
									onClick={() => handleSort('percentage')}
								>
									<div className="flex items-center justify-center gap-1">
										Score
										{sortField === 'percentage' && <SortIcon className="h-3 w-3" />}
									</div>
								</TableHead>
								<TableHead
									className="text-center cursor-pointer hover:text-slate-900 dark:hover:text-slate-100"
									onClick={() => handleSort('backlogs')}
								>
									<div className="flex items-center justify-center gap-1">
										Backlogs
										{sortField === 'backlogs' && <SortIcon className="h-3 w-3" />}
									</div>
								</TableHead>
								<TableHead className="text-center">Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredAndSortedData.length === 0 ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32 text-center text-slate-500">
										<div className="flex flex-col items-center gap-2">
											<Users className="h-8 w-8 opacity-50" />
											<p>No learners found matching your criteria</p>
										</div>
									</TableCell>
								</TableRow>
							) : (
								filteredAndSortedData.map((learner, index) => (
									<TableRow
										key={learner.id}
										className={cn(
											"hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
											learner.status === 'distinction' && "bg-amber-50/30 dark:bg-amber-900/10"
										)}
									>
										<TableCell className="font-mono text-xs">{learner.registerNumber}</TableCell>
										<TableCell className="font-medium">{learner.name}</TableCell>
										<TableCell className="text-slate-600 dark:text-slate-400 text-xs max-w-[150px] truncate">
											{learner.program}
										</TableCell>
										<TableCell className="text-center">
											<Badge variant="secondary" className="text-xs">
												Sem {learner.semester}
											</Badge>
										</TableCell>
										<TableCell className="text-center">
											<span className={cn(
												"font-bold tabular-nums",
												learner.cgpa >= 9 ? "text-emerald-600 dark:text-emerald-400" :
												learner.cgpa >= 8 ? "text-green-600 dark:text-green-400" :
												learner.cgpa >= 6 ? "text-amber-600 dark:text-amber-400" :
												"text-red-600 dark:text-red-400"
											)}>
												{learner.cgpa.toFixed(2)}
											</span>
										</TableCell>
										<TableCell className="text-center">
											<div className="flex items-center justify-center gap-1">
												<span className="font-semibold tabular-nums">{learner.percentage.toFixed(1)}%</span>
												{learner.percentage >= 90 && (
													<Star className="h-3 w-3 fill-amber-500 text-amber-500" />
												)}
											</div>
										</TableCell>
										<TableCell className="text-center">
											{learner.backlogs === 0 ? (
												<Badge variant="outline" className="text-xs border-green-300 text-green-700 dark:border-green-600 dark:text-green-400">
													<CheckCircle2 className="h-3 w-3 mr-1" />
													Clear
												</Badge>
											) : (
												<Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400">
													{learner.backlogs}
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-center">
											{getStatusBadge(learner.status)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	)
}

// Export a simplified version for quick access
export function DrillDownButton({
	label,
	count,
	onClick,
	variant = "default"
}: {
	label: string
	count: number
	onClick: () => void
	variant?: "default" | "success" | "danger" | "warning"
}) {
	const variants = {
		default: "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300",
		success: "bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-900/30 dark:hover:bg-green-900/50 dark:text-green-400",
		danger: "bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400",
		warning: "bg-amber-100 hover:bg-amber-200 text-amber-700 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 dark:text-amber-400"
	}

	return (
		<button
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors",
				variants[variant]
			)}
		>
			{label}: <span className="font-bold tabular-nums">{count.toLocaleString()}</span>
			<ChevronRight className="h-3 w-3" />
		</button>
	)
}
