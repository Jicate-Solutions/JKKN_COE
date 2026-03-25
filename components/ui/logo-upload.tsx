'use client'

import { useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/common/use-toast'
import {
	Upload,
	X,
	ImageIcon,
	Loader2,
	Link as LinkIcon,
	FileImage,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogoUploadProps {
	value: string
	onChange: (url: string) => void
	institutionCode?: string
	logoType?: 'primary' | 'secondary'
	label?: string
	placeholder?: string
	className?: string
	previewSize?: { width: number; height: number }
	disabled?: boolean
}

export function LogoUpload({
	value,
	onChange,
	institutionCode = '',
	logoType = 'primary',
	label = 'Logo',
	placeholder = 'Enter URL or upload image',
	className,
	previewSize = { width: 120, height: 80 },
	disabled = false,
}: LogoUploadProps) {
	const [uploading, setUploading] = useState(false)
	const [dragOver, setDragOver] = useState(false)
	const [mode, setMode] = useState<'url' | 'upload'>('url')
	const [previewError, setPreviewError] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { toast } = useToast()

	const handleFileUpload = useCallback(
		async (file: File) => {
			if (!file) return

			// Validate file type
			const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']
			if (!allowedTypes.includes(file.type)) {
				toast({
					title: 'Invalid file type',
					description: 'Please upload a PNG, JPEG, GIF, WebP, or SVG image.',
					variant: 'destructive',
				})
				return
			}

			// Validate file size (5MB)
			if (file.size > 5 * 1024 * 1024) {
				toast({
					title: 'File too large',
					description: 'Maximum file size is 5MB.',
					variant: 'destructive',
				})
				return
			}

			setUploading(true)
			setPreviewError(false)

			try {
				const formData = new FormData()
				formData.append('file', file)
				formData.append('institution_code', institutionCode)
				formData.append('logo_type', logoType)

				const response = await fetch('/api/upload/logo', {
					method: 'POST',
					body: formData,
				})

				if (!response.ok) {
					const error = await response.json()
					throw new Error(error.error || 'Upload failed')
				}

				const data = await response.json()
				onChange(data.url)

				toast({
					title: 'Logo uploaded',
					description: 'Your logo has been uploaded successfully.',
					className: 'bg-green-50 border-green-200 text-green-800',
				})
			} catch (error) {
				console.error('Upload error:', error)
				toast({
					title: 'Upload failed',
					description: error instanceof Error ? error.message : 'Failed to upload logo',
					variant: 'destructive',
				})
			} finally {
				setUploading(false)
			}
		},
		[institutionCode, logoType, onChange, toast]
	)

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault()
			setDragOver(false)

			if (disabled || uploading) return

			const file = e.dataTransfer.files[0]
			if (file) {
				handleFileUpload(file)
			}
		},
		[disabled, uploading, handleFileUpload]
	)

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault()
		if (!disabled && !uploading) {
			setDragOver(true)
		}
	}

	const handleDragLeave = () => {
		setDragOver(false)
	}

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) {
			handleFileUpload(file)
		}
		// Reset input
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	const handleClear = () => {
		onChange('')
		setPreviewError(false)
	}

	const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		onChange(e.target.value)
		setPreviewError(false)
	}

	// Check if it's a valid image URL for preview
	const isValidImageUrl = value && (value.startsWith('/') || value.startsWith('http'))

	return (
		<div className={cn('space-y-3', className)}>
			{label && (
				<Label className="text-sm font-medium text-slate-700 dark:text-slate-300">
					{label}
				</Label>
			)}

			{/* Mode Toggle */}
			<div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setMode('url')}
					className={cn(
						'h-8 px-3 rounded-md text-xs font-medium transition-all',
						mode === 'url'
							? 'bg-[#0b6d41] text-white shadow-sm'
							: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400'
					)}
				>
					<LinkIcon className="h-3.5 w-3.5 mr-1.5" />
					URL
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => setMode('upload')}
					className={cn(
						'h-8 px-3 rounded-md text-xs font-medium transition-all',
						mode === 'upload'
							? 'bg-[#0b6d41] text-white shadow-sm'
							: 'text-slate-600 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400'
					)}
				>
					<Upload className="h-3.5 w-3.5 mr-1.5" />
					Upload
				</Button>
			</div>

			{/* URL Input Mode */}
			{mode === 'url' && (
				<div className="flex gap-2">
					<Input
						value={value}
						onChange={handleUrlChange}
						placeholder={placeholder}
						disabled={disabled}
						className="flex-1"
					/>
					{value && (
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onClick={handleClear}
							disabled={disabled}
							className="h-10 w-10 text-slate-500 hover:text-red-600"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			)}

			{/* Upload Mode */}
			{mode === 'upload' && (
				<div
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					className={cn(
						'relative border-2 border-dashed rounded-xl p-6 transition-all',
						dragOver
							? 'border-[#0b6d41] bg-[#0b6d41]/5'
							: 'border-slate-300 dark:border-slate-600',
						disabled && 'opacity-50 cursor-not-allowed',
						!disabled && !uploading && 'hover:border-[#0b6d41]/50 cursor-pointer'
					)}
					onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
				>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
						onChange={handleFileSelect}
						disabled={disabled || uploading}
						className="hidden"
					/>

					<div className="flex flex-col items-center gap-2 text-center">
						{uploading ? (
							<>
								<Loader2 className="h-8 w-8 text-[#0b6d41] animate-spin" />
								<p className="text-sm text-slate-600 dark:text-slate-400">Uploading...</p>
							</>
						) : (
							<>
								<div className="h-12 w-12 rounded-xl bg-[#0b6d41]/10 flex items-center justify-center">
									<FileImage className="h-6 w-6 text-[#0b6d41]" />
								</div>
								<div>
									<p className="text-sm font-medium text-slate-700 dark:text-slate-300">
										Drop image here or click to upload
									</p>
									<p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
										PNG, JPEG, GIF, WebP, SVG (max 5MB)
									</p>
								</div>
							</>
						)}
					</div>
				</div>
			)}

			{/* Preview */}
			{isValidImageUrl && (
				<div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
					<div
						className="relative bg-white dark:bg-slate-900 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center"
						style={{ width: previewSize.width, height: previewSize.height }}
					>
						{previewError ? (
							<div className="flex flex-col items-center gap-1 text-slate-400">
								<ImageIcon className="h-6 w-6" />
								<span className="text-xs">Failed to load</span>
							</div>
						) : (
							<Image
								src={value}
								alt="Logo preview"
								width={previewSize.width}
								height={previewSize.height}
								className="object-contain"
								onError={() => setPreviewError(true)}
								unoptimized
							/>
						)}
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
							Current Logo
						</p>
						<p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={value}>
							{value}
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleClear}
							disabled={disabled}
							className="mt-2 h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
						>
							<X className="h-3 w-3 mr-1" />
							Remove
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}
