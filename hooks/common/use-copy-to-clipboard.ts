import { useState, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'

/**
 * Custom hook for copying text to clipboard
 *
 * @example
 * const { copied, copy } = useCopyToClipboard()
 *
 * <button onClick={() => copy('Text to copy')}>
 *   {copied ? 'Copied!' : 'Copy'}
 * </button>
 */
export function useCopyToClipboard(
	timeout = 2000,
	showToast = true
): {
	copied: boolean
	copy: (text: string) => Promise<boolean>
	reset: () => void
} {
	const [copied, setCopied] = useState(false)
	const { toast } = useToast()

	const copy = useCallback(
		async (text: string): Promise<boolean> => {
			if (!navigator?.clipboard) {
				console.warn('Clipboard not supported')
				return false
			}

			try {
				await navigator.clipboard.writeText(text)
				setCopied(true)

				if (showToast) {
					toast({
						title: '✅ Copied to Clipboard',
						description: 'Text has been copied successfully.',
						className:
							'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200',
						duration: 2000
					})
				}

				// Reset after timeout
				setTimeout(() => {
					setCopied(false)
				}, timeout)

				return true
			} catch (error) {
				console.error('Failed to copy text:', error)
				setCopied(false)

				if (showToast) {
					toast({
						title: '❌ Copy Failed',
						description: 'Failed to copy text to clipboard.',
						variant: 'destructive',
						duration: 2000
					})
				}

				return false
			}
		},
		[timeout, showToast, toast]
	)

	const reset = useCallback(() => {
		setCopied(false)
	}, [])

	return { copied, copy, reset }
}
