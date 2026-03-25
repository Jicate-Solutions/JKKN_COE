"use client"

import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import { ReactNode } from "react"

interface PageTransitionProps {
	children: ReactNode
	className?: string
}

/**
 * Page Transition Wrapper Component
 *
 * Adds smooth fade and slide transitions between page navigations
 * Uses Framer Motion for professional SaaS-style animations
 *
 * Usage:
 * ```tsx
 * <PageTransition>
 *   <YourPageContent />
 * </PageTransition>
 * ```
 */
export function PageTransition({ children, className = "" }: PageTransitionProps) {
	const pathname = usePathname()

	return (
		<AnimatePresence mode="wait">
			<motion.div
				key={pathname}
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -8 }}
				transition={{
					duration: 0.3,
					ease: [0.25, 0.1, 0.25, 1.0] // cubic-bezier for smooth easing
				}}
				className={className}
			>
				{children}
			</motion.div>
		</AnimatePresence>
	)
}

/**
 * Card Animation Wrapper
 *
 * Adds staggered fade-in animation for cards
 * Use with index prop for stagger effect
 */
interface CardAnimationProps {
	children: ReactNode
	delay?: number
	className?: string
}

export function CardAnimation({ children, delay = 0, className = "" }: CardAnimationProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.4,
				delay: delay,
				ease: [0.25, 0.1, 0.25, 1.0]
			}}
			className={className}
		>
			{children}
		</motion.div>
	)
}

/**
 * Modal Animation Wrapper
 *
 * Adds scale and fade animation for modals/dialogs
 */
export function ModalAnimation({ children, className = "" }: { children: ReactNode, className?: string }) {
	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0, scale: 0.95 }}
			transition={{
				duration: 0.2,
				ease: [0.25, 0.1, 0.25, 1.0]
			}}
			className={className}
		>
			{children}
		</motion.div>
	)
}

/**
 * Slide In Animation (from left)
 */
export function SlideInLeft({ children, className = "" }: { children: ReactNode, className?: string }) {
	return (
		<motion.div
			initial={{ opacity: 0, x: -20 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{
				duration: 0.3,
				ease: [0.25, 0.1, 0.25, 1.0]
			}}
			className={className}
		>
			{children}
		</motion.div>
	)
}

/**
 * Slide In Animation (from right)
 */
export function SlideInRight({ children, className = "" }: { children: ReactNode, className?: string }) {
	return (
		<motion.div
			initial={{ opacity: 0, x: 20 }}
			animate={{ opacity: 1, x: 0 }}
			transition={{
				duration: 0.3,
				ease: [0.25, 0.1, 0.25, 1.0]
			}}
			className={className}
		>
			{children}
		</motion.div>
	)
}
