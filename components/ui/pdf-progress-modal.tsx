"use client"

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, Clock, Download } from 'lucide-react'

interface PDFProgressModalProps {
	isOpen: boolean
	currentStep: number
	totalSteps: number
	currentOperation?: string
	operationType?: 'single' | 'batch'
}

export function PDFProgressModal({
	isOpen,
	currentStep,
	totalSteps,
	currentOperation = 'Generating PDF...',
	operationType = 'single',
}: PDFProgressModalProps) {
	const [elapsedTime, setElapsedTime] = useState(0)
	const [startTime, setStartTime] = useState<number | null>(null)

	// Start timer when modal opens
	useEffect(() => {
		if (isOpen && !startTime) {
			setStartTime(Date.now())
		}
		if (!isOpen) {
			setStartTime(null)
			setElapsedTime(0)
		}
	}, [isOpen])

	// Update elapsed time every second
	useEffect(() => {
		if (!isOpen || !startTime) return

		const interval = setInterval(() => {
			setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
		}, 1000)

		return () => clearInterval(interval)
	}, [isOpen, startTime])

	if (!isOpen) return null

	const isComplete = currentStep >= totalSteps && totalSteps > 0
	const progressPercentage = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

	// Format elapsed time as MM:SS
	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	return (
		<div className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-200">
			{/* Backdrop with Blur */}
			<div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/60 to-black/70 backdrop-blur-md" />

			{/* Modal Content */}
			<div className="relative bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-8 max-w-lg w-full mx-4 border-2 border-gray-200/50 dark:border-gray-800/50 animate-in zoom-in-95 duration-300">
				{/* Animated Gradient Border */}
				<div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-t-3xl animate-pulse" />

				{/* Icon and Title */}
				<div className="flex flex-col items-center mb-6">
					{isComplete ? (
						<div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center mb-4 shadow-lg animate-in zoom-in duration-500">
							<CheckCircle2 className="w-10 h-10 text-white animate-in zoom-in duration-700" />
						</div>
					) : (
						<div className="relative w-20 h-20 mb-4">
							<div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 animate-spin opacity-75" style={{ animationDuration: '3s' }} />
							<div className="absolute inset-1 rounded-full bg-white dark:bg-gray-900 flex items-center justify-center">
								<Download className="w-8 h-8 text-purple-600 animate-bounce" />
							</div>
						</div>
					)}

					<h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
						{isComplete ? '🎉 Complete!' : '📄 Generating PDF'}
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400 text-center max-w-xs">
						{isComplete ? 'Your PDF has been generated successfully!' : 'Please wait while we prepare your document'}
					</p>
				</div>

				{/* Progress Bar Only (No Numbers) */}
				<div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-4 mb-6 overflow-hidden shadow-inner">
					<div
						className="h-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
						style={{ width: `${progressPercentage}%` }}
					>
						{/* Shimmer effect */}
						<div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
					</div>
				</div>

				{/* Current Operation */}
				<div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/30 rounded-lg p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
					<div className="flex items-center gap-3">
						{!isComplete && <Loader2 className="w-5 h-5 animate-spin text-purple-600 dark:text-purple-400 flex-shrink-0" />}
						<p className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1">
							{currentOperation}
						</p>
						{/* Elapsed Time */}
						{!isComplete && elapsedTime > 0 && (
							<div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
								<Clock className="w-3 h-3" />
								<span>{formatTime(elapsedTime)}</span>
							</div>
						)}
					</div>
				</div>

				{/* Warning Message */}
				{!isComplete && (
					<div className="mt-6 text-center bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
						<p className="text-xs font-medium text-amber-800 dark:text-amber-200">
							⚠️ Please do not close this window or navigate away
						</p>
					</div>
				)}

				{/* Success Message */}
				{isComplete && (
					<div className="mt-6 text-center bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800 animate-in slide-in-from-bottom duration-500">
						<p className="text-sm font-medium text-green-800 dark:text-green-200">
							✓ Your download will begin automatically
						</p>
					</div>
				)}
			</div>
		</div>
	)
}
