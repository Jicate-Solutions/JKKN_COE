'use client'

import { useState } from 'react'
import { useBugReporter } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Bug, CheckCircle2, XCircle } from 'lucide-react'
import { useToast } from '@/hooks'

/**
 * Example component demonstrating all bug reporter features
 *
 * This component is for demonstration purposes only.
 * You can use it as a reference for implementing bug reporting in your components.
 */
export function BugReporterExample() {
	const { reportBug, reportError, reportException, isAvailable } = useBugReporter()
	const { toast } = useToast()
	const [lastReportStatus, setLastReportStatus] = useState<'success' | 'error' | null>(null)

	// Example 1: Manual bug report
	const handleManualBugReport = async () => {
		const result = await reportBug({
			title: 'Example Bug Report',
			description: 'This is a test bug report triggered manually from the example component.',
			category: 'bug',
			severity: 'low',
			metadata: {
				source: 'BugReporterExample',
				timestamp: new Date().toISOString()
			}
		})

		if (result.success) {
			setLastReportStatus('success')
			toast({
				title: '✅ Bug Reported',
				description: 'Your bug report has been submitted successfully.',
				className: 'bg-green-50 border-green-200 text-green-800'
			})
		} else {
			setLastReportStatus('error')
			toast({
				title: '❌ Report Failed',
				description: result.error || 'Failed to submit bug report.',
				variant: 'destructive'
			})
		}
	}

	// Example 2: Report an error
	const handleErrorReport = async () => {
		try {
			// Simulate an error
			throw new Error('This is a simulated error for demonstration purposes')
		} catch (error) {
			const result = await reportError(error, 'Example Error Report')

			if (result.success) {
				setLastReportStatus('success')
				toast({
					title: '✅ Error Reported',
					description: 'The error has been reported to the development team.',
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			} else {
				setLastReportStatus('error')
			}
		}
	}

	// Example 3: Report exception with context
	const handleExceptionReport = async () => {
		try {
			// Simulate an async operation that fails
			await simulateAsyncError()
		} catch (error) {
			const result = await reportException(error, {
				action: 'simulateAsyncError',
				component: 'BugReporterExample',
				additionalInfo: {
					attemptTime: new Date().toISOString(),
					exampleData: { foo: 'bar' }
				}
			})

			if (result.success) {
				setLastReportStatus('success')
				toast({
					title: '✅ Exception Reported',
					description: 'The exception has been logged with full context.',
					className: 'bg-green-50 border-green-200 text-green-800'
				})
			} else {
				setLastReportStatus('error')
			}
		}
	}

	// Example 4: Trigger a React error (will be caught by ErrorBoundary)
	const [shouldThrow, setShouldThrow] = useState(false)

	if (shouldThrow) {
		throw new Error('This is a React error that should be caught by ErrorBoundary')
	}

	// Simulated async function that throws an error
	const simulateAsyncError = async (): Promise<void> => {
		await new Promise(resolve => setTimeout(resolve, 100))
		throw new Error('Simulated async operation failure')
	}

	return (
		<div className="space-y-6 p-6">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								<Bug className="h-5 w-5" />
								Bug Reporter Examples
							</CardTitle>
							<CardDescription className="mt-2">
								Demonstration of programmatic bug reporting features
							</CardDescription>
						</div>
						<Badge variant={isAvailable ? 'default' : 'destructive'}>
							{isAvailable ? (
								<>
									<CheckCircle2 className="h-3 w-3 mr-1" />
									Available
								</>
							) : (
								<>
									<XCircle className="h-3 w-3 mr-1" />
									Unavailable
								</>
							)}
						</Badge>
					</div>
				</CardHeader>

				<CardContent className="space-y-6">
					{/* Status indicator */}
					{lastReportStatus && (
						<div
							className={`p-4 rounded-lg border ${
								lastReportStatus === 'success'
									? 'bg-green-50 border-green-200 text-green-800'
									: 'bg-red-50 border-red-200 text-red-800'
							}`}
						>
							{lastReportStatus === 'success' ? (
								<div className="flex items-center gap-2">
									<CheckCircle2 className="h-4 w-4" />
									<span className="text-sm font-medium">Last report submitted successfully!</span>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<AlertTriangle className="h-4 w-4" />
									<span className="text-sm font-medium">Last report failed to submit.</span>
								</div>
							)}
						</div>
					)}

					{/* Example 1: Manual Bug Report */}
					<div className="space-y-2">
						<h3 className="font-semibold text-sm">Example 1: Manual Bug Report</h3>
						<p className="text-sm text-muted-foreground">
							Report a bug with custom title, description, and metadata.
						</p>
						<Button onClick={handleManualBugReport} disabled={!isAvailable} size="sm">
							Report Manual Bug
						</Button>
					</div>

					{/* Example 2: Error Report */}
					<div className="space-y-2">
						<h3 className="font-semibold text-sm">Example 2: Error Report</h3>
						<p className="text-sm text-muted-foreground">
							Report a caught error with automatic stack trace extraction.
						</p>
						<Button onClick={handleErrorReport} disabled={!isAvailable} size="sm" variant="secondary">
							Report Error
						</Button>
					</div>

					{/* Example 3: Exception Report with Context */}
					<div className="space-y-2">
						<h3 className="font-semibold text-sm">Example 3: Exception with Context</h3>
						<p className="text-sm text-muted-foreground">
							Report an exception with additional context information.
						</p>
						<Button onClick={handleExceptionReport} disabled={!isAvailable} size="sm" variant="outline">
							Report Exception
						</Button>
					</div>

					{/* Example 4: React Error Boundary */}
					<div className="space-y-2">
						<h3 className="font-semibold text-sm">Example 4: React Error (ErrorBoundary)</h3>
						<p className="text-sm text-muted-foreground">
							Trigger a React error that will be caught by the ErrorBoundary component.
						</p>
						<Button
							onClick={() => setShouldThrow(true)}
							disabled={!isAvailable}
							size="sm"
							variant="destructive"
						>
							Trigger React Error
						</Button>
						<p className="text-xs text-amber-600 dark:text-amber-400">
							⚠️ This will throw an error and should be wrapped in an ErrorBoundary component.
						</p>
					</div>

					{/* Usage Code Examples */}
					<div className="space-y-2 mt-6 pt-6 border-t">
						<h3 className="font-semibold text-sm mb-3">Code Examples:</h3>

						<div className="space-y-4">
							<div className="bg-muted p-4 rounded-lg">
								<p className="text-xs font-mono text-muted-foreground mb-2">
									// Manual bug report
								</p>
								<pre className="text-xs overflow-x-auto">
									{`const { reportBug } = useBugReporter()

await reportBug({
  title: 'Bug title',
  description: 'Bug description',
  category: 'bug',
  severity: 'medium'
})`}
								</pre>
							</div>

							<div className="bg-muted p-4 rounded-lg">
								<p className="text-xs font-mono text-muted-foreground mb-2">
									// Error report in try-catch
								</p>
								<pre className="text-xs overflow-x-auto">
									{`const { reportError } = useBugReporter()

try {
  await someOperation()
} catch (error) {
  await reportError(error, 'Operation failed')
}`}
								</pre>
							</div>

							<div className="bg-muted p-4 rounded-lg">
								<p className="text-xs font-mono text-muted-foreground mb-2">
									// Exception with context
								</p>
								<pre className="text-xs overflow-x-auto">
									{`const { reportException } = useBugReporter()

await reportException(error, {
  action: 'saveData',
  component: 'MyComponent',
  additionalInfo: { userId: user.id }
})`}
								</pre>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	)
}
