"use client"

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertTriangle, Trash2, Info, CheckCircle2 } from "lucide-react"
import { ReactNode } from "react"

interface ConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	title?: string
	description?: string
	confirmText?: string
	cancelText?: string
	variant?: "destructive" | "default" | "warning" | "success"
	loading?: boolean
}

/**
 * Modern Confirmation Dialog Component
 *
 * Clean, accessible confirmation dialog with variants
 *
 * Usage:
 * ```tsx
 * <ConfirmDialog
 *   open={deleteDialogOpen}
 *   onOpenChange={setDeleteDialogOpen}
 *   onConfirm={handleDelete}
 *   variant="destructive"
 *   title="Delete Institution"
 *   description="Are you sure you want to delete this institution? This action cannot be undone."
 *   confirmText="Delete"
 *   loading={deleting}
 * />
 * ```
 */
export function ConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
	title = "Are you sure?",
	description = "This action cannot be undone.",
	confirmText = "Confirm",
	cancelText = "Cancel",
	variant = "default",
	loading = false,
}: ConfirmDialogProps) {
	const getVariantStyles = () => {
		switch (variant) {
			case "destructive":
				return {
					icon: <Trash2 className="h-5 w-5 text-destructive" />,
					iconBg: "bg-destructive/10",
					titleColor: "text-destructive",
					buttonClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
				}
			case "warning":
				return {
					icon: <AlertTriangle className="h-5 w-5 text-warning" />,
					iconBg: "bg-warning/10",
					titleColor: "text-warning",
					buttonClass: "bg-warning hover:bg-warning/90 text-white",
				}
			case "success":
				return {
					icon: <CheckCircle2 className="h-5 w-5 text-saas-accent-600" />,
					iconBg: "bg-saas-accent-100 dark:bg-saas-accent-900/20",
					titleColor: "text-saas-accent-600 dark:text-saas-accent-400",
					buttonClass: "bg-saas-accent-600 hover:bg-saas-accent-700 text-white",
				}
			default:
				return {
					icon: <Info className="h-5 w-5 text-saas-primary-600" />,
					iconBg: "bg-saas-primary-100 dark:bg-saas-primary-900/20",
					titleColor: "text-saas-primary-600 dark:text-saas-primary-400",
					buttonClass: "bg-saas-primary-600 hover:bg-saas-primary-700 text-white",
				}
		}
	}

	const styles = getVariantStyles()

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent className="max-w-md rounded-2xl">
				<AlertDialogHeader>
					<div className="flex items-center gap-3 mb-2">
						<div className={`h-10 w-10 rounded-full ${styles.iconBg} flex items-center justify-center`}>
							{styles.icon}
						</div>
						<AlertDialogTitle className={`text-xl ${styles.titleColor}`}>
							{title}
						</AlertDialogTitle>
					</div>
					<AlertDialogDescription className="text-muted-foreground text-base mt-2">
						{description}
					</AlertDialogDescription>
				</AlertDialogHeader>

				<AlertDialogFooter className="mt-6">
					<AlertDialogCancel
						disabled={loading}
						className="rounded-lg"
					>
						{cancelText}
					</AlertDialogCancel>
					<AlertDialogAction
						onClick={onConfirm}
						disabled={loading}
						className={`${styles.buttonClass} rounded-lg`}
					>
						{loading ? "Processing..." : confirmText}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}

/**
 * Delete Confirmation Dialog
 * Pre-configured for delete actions
 */
interface DeleteConfirmDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onConfirm: () => void
	itemName?: string
	loading?: boolean
}

export function DeleteConfirmDialog({
	open,
	onOpenChange,
	onConfirm,
	itemName = "this item",
	loading = false,
}: DeleteConfirmDialogProps) {
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			onConfirm={onConfirm}
			variant="destructive"
			title="Delete Confirmation"
			description={`Are you sure you want to delete ${itemName}? This action cannot be undone and all associated data will be permanently removed.`}
			confirmText="Delete"
			loading={loading}
		/>
	)
}
