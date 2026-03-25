'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/common/use-toast'
import { useInstitutionFilter } from '@/hooks/use-institution-filter'
import { useAuth } from '@/context/auth-context'
import { Plus, RefreshCw, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react'
import type { RevaluationFeeConfig } from '@/types/revaluation'

export default function FeeConfigurationTab() {
	const { toast } = useToast()
	const { hasPermission } = useAuth()
	const { filter, isReady, appendToUrl, getInstitutionIdForCreate } = useInstitutionFilter()

	const [feeConfigs, setFeeConfigs] = useState<RevaluationFeeConfig[]>([])
	const [loading, setLoading] = useState(false)
	const [dialogOpen, setDialogOpen] = useState(false)
	const [selectedConfig, setSelectedConfig] = useState<RevaluationFeeConfig | null>(null)

	const [formData, setFormData] = useState({
		attempt_1_fee: '',
		attempt_2_fee: '',
		attempt_3_fee: '',
		theory_course_fee: '',
		practical_course_fee: '',
		project_course_fee: '',
		effective_from: '',
		effective_to: '',
		is_active: true,
	})
	const [errors, setErrors] = useState<Record<string, string>>({})

	const canConfigure = hasPermission('revaluation:configure')

	useEffect(() => {
		if (isReady) {
			fetchFeeConfigs()
		}
	}, [isReady, filter])

	useEffect(() => {
		if (selectedConfig && dialogOpen) {
			setFormData({
				attempt_1_fee: selectedConfig.attempt_1_fee.toString(),
				attempt_2_fee: selectedConfig.attempt_2_fee.toString(),
				attempt_3_fee: selectedConfig.attempt_3_fee.toString(),
				theory_course_fee: selectedConfig.theory_course_fee?.toString() || '',
				practical_course_fee: selectedConfig.practical_course_fee?.toString() || '',
				project_course_fee: selectedConfig.project_course_fee?.toString() || '',
				effective_from: selectedConfig.effective_from,
				effective_to: selectedConfig.effective_to || '',
				is_active: selectedConfig.is_active,
			})
		} else if (!dialogOpen) {
			resetForm()
		}
	}, [selectedConfig, dialogOpen])

	const fetchFeeConfigs = async () => {
		setLoading(true)
		try {
			const url = appendToUrl('/api/revaluation/fee-config')
			const response = await fetch(url)
			if (!response.ok) throw new Error('Failed to fetch fee configurations')

			const data = await response.json()
			setFeeConfigs(data)
		} catch (error) {
			console.error('Fetch error:', error)
			toast({
				title: '❌ Failed to fetch fee configurations',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const validate = () => {
		const newErrors: Record<string, string> = {}

		if (!formData.attempt_1_fee.trim() || Number(formData.attempt_1_fee) < 0)
			newErrors.attempt_1_fee = 'Required'
		if (!formData.attempt_2_fee.trim() || Number(formData.attempt_2_fee) < 0)
			newErrors.attempt_2_fee = 'Required'
		if (!formData.attempt_3_fee.trim() || Number(formData.attempt_3_fee) < 0)
			newErrors.attempt_3_fee = 'Required'
		if (!formData.effective_from) newErrors.effective_from = 'Required'

		setErrors(newErrors)
		return Object.keys(newErrors).length === 0
	}

	const handleSubmit = async () => {
		if (!validate()) return

		setLoading(true)
		try {
			const institutionsId = getInstitutionIdForCreate()
			if (!institutionsId) {
				throw new Error('Institution is required')
			}

			const method = selectedConfig ? 'PUT' : 'POST'
			const body = {
				...(selectedConfig && { id: selectedConfig.id }),
				institutions_id: institutionsId,
				attempt_1_fee: Number(formData.attempt_1_fee),
				attempt_2_fee: Number(formData.attempt_2_fee),
				attempt_3_fee: Number(formData.attempt_3_fee),
				theory_course_fee: formData.theory_course_fee ? Number(formData.theory_course_fee) : null,
				practical_course_fee: formData.practical_course_fee
					? Number(formData.practical_course_fee)
					: null,
				project_course_fee: formData.project_course_fee
					? Number(formData.project_course_fee)
					: null,
				effective_from: formData.effective_from,
				effective_to: formData.effective_to || null,
				is_active: formData.is_active,
			}

			const response = await fetch('/api/revaluation/fee-config', {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to save fee configuration')
			}

			toast({
				title: selectedConfig ? '✅ Configuration Updated' : '✅ Configuration Created',
				description: 'Fee configuration saved successfully',
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			setDialogOpen(false)
			setSelectedConfig(null)
			fetchFeeConfigs()
		} catch (error) {
			console.error('Submit error:', error)
			toast({
				title: '❌ Failed to save',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this fee configuration?')) return

		setLoading(true)
		try {
			const response = await fetch(`/api/revaluation/fee-config?id=${id}`, {
				method: 'DELETE',
			})

			const result = await response.json()

			if (!response.ok) {
				throw new Error(result.error || 'Failed to delete')
			}

			toast({
				title: '✅ Configuration Deleted',
				description: 'Fee configuration deleted successfully',
				className: 'bg-green-50 border-green-200 text-green-800',
			})

			fetchFeeConfigs()
		} catch (error) {
			console.error('Delete error:', error)
			toast({
				title: '❌ Failed to delete',
				description: error instanceof Error ? error.message : 'Unknown error',
				variant: 'destructive',
			})
		} finally {
			setLoading(false)
		}
	}

	const resetForm = () => {
		setFormData({
			attempt_1_fee: '',
			attempt_2_fee: '',
			attempt_3_fee: '',
			theory_course_fee: '',
			practical_course_fee: '',
			project_course_fee: '',
			effective_from: '',
			effective_to: '',
			is_active: true,
		})
		setErrors({})
	}

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex justify-between items-center">
				<div className="text-sm text-gray-600">
					Active configurations:{' '}
					<span className="font-medium text-green-600">
						{feeConfigs.filter((c) => c.is_active).length}
					</span>
				</div>
				<div className="flex gap-2">
					<Button onClick={fetchFeeConfigs} variant="outline" disabled={loading}>
						<RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
					{canConfigure && (
						<Button
							onClick={() => {
								setSelectedConfig(null)
								setDialogOpen(true)
							}}
							className="bg-blue-600 hover:bg-blue-700"
						>
							<Plus className="h-4 w-4 mr-2" />
							New Configuration
						</Button>
					)}
				</div>
			</div>

			{/* Fee Configurations Table */}
			<div className="border rounded-lg overflow-hidden">
				<Table>
					<TableHeader>
						<TableRow className="bg-gray-50">
							<TableHead>Status</TableHead>
							<TableHead>Attempt 1</TableHead>
							<TableHead>Attempt 2</TableHead>
							<TableHead>Attempt 3</TableHead>
							<TableHead>Effective Period</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{loading ? (
							<TableRow>
								<TableCell colSpan={6} className="text-center py-8">
									<div className="flex items-center justify-center gap-2">
										<div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
										<span className="text-sm text-gray-600">Loading...</span>
									</div>
								</TableCell>
							</TableRow>
						) : feeConfigs.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="text-center py-8 text-gray-500">
									No fee configurations found. Create one to get started.
								</TableCell>
							</TableRow>
						) : (
							feeConfigs.map((config) => (
								<TableRow key={config.id} className="hover:bg-gray-50">
									<TableCell>
										{config.is_active ? (
											<Badge className="bg-green-100 text-green-800 border-green-300">
												<CheckCircle className="h-3 w-3 mr-1" />
												Active
											</Badge>
										) : (
											<Badge variant="outline">
												<XCircle className="h-3 w-3 mr-1" />
												Inactive
											</Badge>
										)}
									</TableCell>
									<TableCell className="font-medium">₹{config.attempt_1_fee.toFixed(2)}</TableCell>
									<TableCell className="font-medium">₹{config.attempt_2_fee.toFixed(2)}</TableCell>
									<TableCell className="font-medium">₹{config.attempt_3_fee.toFixed(2)}</TableCell>
									<TableCell>
										<div className="text-sm">
											<div>From: {new Date(config.effective_from).toLocaleDateString()}</div>
											{config.effective_to && (
												<div className="text-gray-500">
													To: {new Date(config.effective_to).toLocaleDateString()}
												</div>
											)}
										</div>
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-1">
											{canConfigure && (
												<>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														onClick={() => {
															setSelectedConfig(config)
															setDialogOpen(true)
														}}
													>
														<Edit className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
														onClick={() => handleDelete(config.id)}
													>
														<Trash2 className="h-4 w-4" />
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

			{/* Fee Configuration Dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>
							{selectedConfig ? 'Edit Fee Configuration' : 'New Fee Configuration'}
						</DialogTitle>
						<DialogDescription>Configure revaluation fees by attempt number</DialogDescription>
					</DialogHeader>

					<div className="space-y-6 py-4">
						{/* Attempt Fees */}
						<div className="space-y-4">
							<h3 className="font-medium text-gray-900">Attempt-wise Fees *</h3>
							<div className="grid grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label htmlFor="attempt1">Attempt 1</Label>
									<Input
										id="attempt1"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.attempt_1_fee}
										onChange={(e) => setFormData((prev) => ({ ...prev, attempt_1_fee: e.target.value }))}
										className={errors.attempt_1_fee ? 'border-red-500' : ''}
									/>
									{errors.attempt_1_fee && (
										<p className="text-sm text-red-600">{errors.attempt_1_fee}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="attempt2">Attempt 2</Label>
									<Input
										id="attempt2"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.attempt_2_fee}
										onChange={(e) => setFormData((prev) => ({ ...prev, attempt_2_fee: e.target.value }))}
										className={errors.attempt_2_fee ? 'border-red-500' : ''}
									/>
									{errors.attempt_2_fee && (
										<p className="text-sm text-red-600">{errors.attempt_2_fee}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="attempt3">Attempt 3</Label>
									<Input
										id="attempt3"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.attempt_3_fee}
										onChange={(e) => setFormData((prev) => ({ ...prev, attempt_3_fee: e.target.value }))}
										className={errors.attempt_3_fee ? 'border-red-500' : ''}
									/>
									{errors.attempt_3_fee && (
										<p className="text-sm text-red-600">{errors.attempt_3_fee}</p>
									)}
								</div>
							</div>
						</div>

						{/* Course Type Fees (Optional) */}
						<div className="space-y-4 border-t pt-4">
							<h3 className="font-medium text-gray-900">Course Type Fees (Optional)</h3>
							<div className="grid grid-cols-3 gap-4">
								<div className="space-y-2">
									<Label htmlFor="theory">Theory</Label>
									<Input
										id="theory"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.theory_course_fee}
										onChange={(e) => setFormData((prev) => ({ ...prev, theory_course_fee: e.target.value }))}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="practical">Practical</Label>
									<Input
										id="practical"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.practical_course_fee}
										onChange={(e) =>
											setFormData((prev) => ({ ...prev, practical_course_fee: e.target.value }))
										}
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="project">Project</Label>
									<Input
										id="project"
										type="number"
										step="0.01"
										placeholder="0.00"
										value={formData.project_course_fee}
										onChange={(e) => setFormData((prev) => ({ ...prev, project_course_fee: e.target.value }))}
									/>
								</div>
							</div>
						</div>

						{/* Effective Period */}
						<div className="space-y-4 border-t pt-4">
							<h3 className="font-medium text-gray-900">Effective Period</h3>
							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="from">From Date *</Label>
									<Input
										id="from"
										type="date"
										value={formData.effective_from}
										onChange={(e) => setFormData((prev) => ({ ...prev, effective_from: e.target.value }))}
										className={errors.effective_from ? 'border-red-500' : ''}
									/>
									{errors.effective_from && (
										<p className="text-sm text-red-600">{errors.effective_from}</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="to">To Date (Optional)</Label>
									<Input
										id="to"
										type="date"
										value={formData.effective_to}
										onChange={(e) => setFormData((prev) => ({ ...prev, effective_to: e.target.value }))}
									/>
								</div>
							</div>
						</div>

						{/* Active Status */}
						<div className="flex items-center gap-2">
							<input
								type="checkbox"
								id="is_active"
								checked={formData.is_active}
								onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
								className="h-4 w-4 rounded border-gray-300"
							/>
							<Label htmlFor="is_active" className="cursor-pointer">
								Set as active configuration (will deactivate other configs)
							</Label>
						</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>
							Cancel
						</Button>
						<Button
							onClick={handleSubmit}
							disabled={loading}
							className="bg-blue-600 hover:bg-blue-700"
						>
							{loading && <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
							{selectedConfig ? 'Update' : 'Create'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
