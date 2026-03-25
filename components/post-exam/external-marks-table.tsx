'use client'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
	ArrowUpDown,
	ArrowUp,
	ArrowDown,
	RefreshCw,
	ChevronLeft,
	ChevronRight,
	XCircle,
	ClipboardList
} from 'lucide-react'
import type { ExternalMark } from '@/types/external-marks'

interface ExternalMarksTableProps {
	// Data
	pageItems: ExternalMark[]
	filtered: ExternalMark[]

	// State
	loading: boolean
	fetchError: string | null
	mustSelectInstitution: boolean

	// Selection
	selectedIds: Set<string>
	selectAll: boolean
	onSelectAll: (checked: boolean) => void
	onSelectItem: (id: string, checked: boolean) => void

	// Sorting
	sortColumn: string | null
	sortDirection: 'asc' | 'desc'
	onSort: (column: string) => void

	// Pagination
	currentPage: number
	totalPages: number
	itemsPerPage: number
	startIndex: number
	endIndex: number
	onPageChange: (page: number) => void
	onItemsPerPageChange: (count: number) => void

	// Actions
	onRetry: () => void
}

export function ExternalMarksTable({
	pageItems,
	filtered,
	loading,
	fetchError,
	mustSelectInstitution,
	selectedIds,
	selectAll,
	onSelectAll,
	onSelectItem,
	sortColumn,
	sortDirection,
	onSort,
	currentPage,
	totalPages,
	itemsPerPage,
	startIndex,
	endIndex,
	onPageChange,
	onItemsPerPageChange,
	onRetry
}: ExternalMarksTableProps) {
	const getSortIcon = (column: string) => {
		if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
		return sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
	}

	return (
		<>
			<div className="rounded-md border overflow-hidden" style={{ height: "400px" }}>
				<div className="h-full overflow-auto">
					<Table>
						<TableHeader className="sticky top-0 bg-muted/50 z-10">
							<TableRow>
								<TableHead className="w-[40px] py-2">
									<Checkbox
										checked={selectAll}
										onCheckedChange={onSelectAll}
									/>
								</TableHead>
								<TableHead className="w-[50px] py-2 text-center">
									<div className="text-xs font-medium">S.No</div>
								</TableHead>
								{/* Show Institution column when "All Institutions" is selected */}
								{mustSelectInstitution && (
									<TableHead className="py-2 cursor-pointer" onClick={() => onSort('institution_code')}>
										<div className="flex items-center gap-1 text-xs font-medium">
											Institution {getSortIcon('institution_code')}
										</div>
									</TableHead>
								)}
								<TableHead className="py-2 cursor-pointer" onClick={() => onSort('dummy_number')}>
									<div className="flex items-center gap-1 text-xs font-medium">
										Dummy No {getSortIcon('dummy_number')}
									</div>
								</TableHead>
								<TableHead className="py-2 cursor-pointer min-w-[150px]" onClick={() => onSort('student_name')}>
									<div className="flex items-center gap-1 text-xs font-medium">
										Student Name {getSortIcon('student_name')}
									</div>
								</TableHead>
								<TableHead className="py-2 cursor-pointer" onClick={() => onSort('course_code')}>
									<div className="flex items-center gap-1 text-xs font-medium">
										Course Code {getSortIcon('course_code')}
									</div>
								</TableHead>
								<TableHead className="py-2 min-w-[180px]">
									<div className="text-xs font-medium">Course Name</div>
								</TableHead>
								<TableHead className="py-2 text-center">
									<div className="text-xs font-medium">Marks</div>
								</TableHead>
								<TableHead className="py-2 text-center">
									<div className="text-xs font-medium">Out Of</div>
								</TableHead>
								<TableHead className="py-2 text-center">
									<div className="text-xs font-medium">%</div>
								</TableHead>
								<TableHead className="py-2">
									<div className="text-xs font-medium">Status</div>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{loading ? (
								<TableRow>
									<TableCell colSpan={mustSelectInstitution ? 11 : 10} className="text-center py-8 text-muted-foreground">
										<RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
										Loading...
									</TableCell>
								</TableRow>
							) : fetchError ? (
								<TableRow>
									<TableCell colSpan={mustSelectInstitution ? 11 : 10} className="text-center py-8">
										<div className="flex flex-col items-center gap-3">
											<div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
												<XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
											</div>
											<div className="text-center">
												<p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Failed to Load Data</p>
												<p className="text-xs text-muted-foreground max-w-md">{fetchError}</p>
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={onRetry}
												className="mt-2"
											>
												<RefreshCw className="h-3 w-3 mr-2" />
												Try Again
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : pageItems.length === 0 ? (
								<TableRow>
									<TableCell colSpan={mustSelectInstitution ? 11 : 10} className="text-center py-8 text-muted-foreground">
										No records found
									</TableCell>
								</TableRow>
							) : (
								pageItems.map((item, index) => (
									<TableRow key={item.id} className="hover:bg-muted/30">
										<TableCell className="py-2">
											<Checkbox
												checked={selectedIds.has(item.id)}
												onCheckedChange={(checked) => onSelectItem(item.id, checked as boolean)}
											/>
										</TableCell>
										<TableCell className="py-2 text-center text-xs text-muted-foreground">
											{startIndex + index + 1}
										</TableCell>
										{/* Show Institution column when "All Institutions" is selected */}
										{mustSelectInstitution && (
											<TableCell className="py-2 text-xs font-medium">
												{item.institution_code || 'N/A'}
											</TableCell>
										)}
										<TableCell className="py-2 text-xs font-medium">{item.dummy_number}</TableCell>
										<TableCell className="py-2 text-xs whitespace-normal break-words">{item.student_name}</TableCell>
										<TableCell className="py-2 text-xs font-mono">{item.course_code}</TableCell>
										<TableCell className="py-2 text-xs whitespace-normal break-words">{item.course_name}</TableCell>
										<TableCell className="py-2 text-center text-xs font-medium">
											{item.total_marks_obtained}
										</TableCell>
										<TableCell className="py-2 text-center text-xs font-medium">
											{item.marks_out_of}
										</TableCell>
										<TableCell className="py-2 text-center text-xs font-medium">
											{item.percentage?.toFixed(1) || '0.0'}%
										</TableCell>
										<TableCell className="py-2">
											<Badge
												variant={item.entry_status === 'Submitted' ? 'default' : 'secondary'}
												className="text-xs"
											>
												{item.entry_status}
											</Badge>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Pagination */}
			<div className="flex items-center justify-between mt-3 flex-shrink-0">
				<p className="text-xs text-muted-foreground">
					Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length}
				</p>
				<div className="flex items-center gap-4">
					{/* Rows per page dropdown */}
					<div className="flex items-center gap-2">
						<span className="text-xs text-muted-foreground">Rows per page:</span>
						<Select
							value={String(itemsPerPage)}
							onValueChange={(value) => onItemsPerPageChange(Number(value))}
						>
							<SelectTrigger className="h-7 w-[70px] text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="10">10</SelectItem>
								<SelectItem value="20">20</SelectItem>
								<SelectItem value="50">50</SelectItem>
								<SelectItem value="100">100</SelectItem>
								<SelectItem value="100000">100000</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{/* Page navigation */}
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-2"
							onClick={() => onPageChange(1)}
							disabled={currentPage === 1}
						>
							<ChevronLeft className="h-3 w-3" />
							<ChevronLeft className="h-3 w-3 -ml-2" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={() => onPageChange(currentPage - 1)}
							disabled={currentPage === 1}
						>
							<ChevronLeft className="h-3 w-3" />
						</Button>
						<span className="text-xs px-2">
							Page {currentPage} of {totalPages}
						</span>
						<Button
							variant="outline"
							size="sm"
							className="h-7 w-7 p-0"
							onClick={() => onPageChange(currentPage + 1)}
							disabled={currentPage === totalPages}
						>
							<ChevronRight className="h-3 w-3" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-2"
							onClick={() => onPageChange(totalPages)}
							disabled={currentPage === totalPages}
						>
							<ChevronRight className="h-3 w-3" />
							<ChevronRight className="h-3 w-3 -ml-2" />
						</Button>
					</div>
				</div>
			</div>
		</>
	)
}
