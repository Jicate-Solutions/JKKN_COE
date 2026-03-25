'use client'

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
	children: ReactNode
	fallback?: ReactNode
	onError?: (error: Error, errorInfo: React.ErrorInfo) => void
	showDetails?: boolean
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: React.ErrorInfo | null
}

/**
 * Error Boundary with automatic bug reporting
 *
 * This component catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI. It also automatically reports
 * errors to the bug reporter system.
 *
 * @example
 * ```tsx
 * <ErrorBoundaryWithReporter>
 *   <YourComponent />
 * </ErrorBoundaryWithReporter>
 * ```
 *
 * @example With custom fallback
 * ```tsx
 * <ErrorBoundaryWithReporter
 *   fallback={<CustomErrorUI />}
 *   showDetails={true}
 * >
 *   <YourComponent />
 * </ErrorBoundaryWithReporter>
 * ```
 */
export class ErrorBoundaryWithReporter extends Component<Props, State> {
	constructor(props: Props) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null
		}
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return {
			hasError: true,
			error
		}
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		// Log error to console
		console.error('ErrorBoundary caught an error:', error, errorInfo)

		// Store error info in state
		this.setState({
			error,
			errorInfo
		})

		// Call optional error handler
		if (this.props.onError) {
			this.props.onError(error, errorInfo)
		}

		// Report to bug reporter
		this.reportError(error, errorInfo)
	}

	reportError = async (error: Error, errorInfo: React.ErrorInfo) => {
		try {
			// Use fetch to report the error since we can't use hooks in class components
			const errorReport = {
				title: `React Error: ${error.name}`,
				description: [
					error.message,
					'',
					'Stack Trace:',
					error.stack || 'No stack trace available',
					'',
					'Component Stack:',
					errorInfo.componentStack || 'No component stack available'
				].join('\n'),
				page_url: typeof window !== 'undefined' ? window.location.href : '',
				category: 'error',
				console_logs: [],
				severity: 'critical',
				metadata: {
					errorName: error.name,
					timestamp: new Date().toISOString(),
					userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined
				}
			}

			// This will be handled by the bug reporter SDK if it's available
			// You may need to adjust this based on your actual API endpoint
			if (typeof window !== 'undefined' && (window as any).bugReporterAPI) {
				await (window as any).bugReporterAPI.createBugReport(errorReport)
			}
		} catch (reportError) {
			console.error('Failed to report error to bug reporter:', reportError)
		}
	}

	handleReset = () => {
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null
		})
	}

	handleGoHome = () => {
		if (typeof window !== 'undefined') {
			window.location.href = '/coe/dashboard'
		}
	}

	render() {
		if (this.state.hasError) {
			// Use custom fallback if provided
			if (this.props.fallback) {
				return this.props.fallback
			}

			// Default error UI
			return (
				<div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/20 dark:to-orange-950/20">
					<Card className="max-w-2xl w-full shadow-lg">
						<CardHeader>
							<div className="flex items-center gap-3 mb-2">
								<div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
									<AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
								</div>
								<div>
									<CardTitle className="text-2xl text-red-600 dark:text-red-400">
										Oops! Something went wrong
									</CardTitle>
									<CardDescription className="mt-1">
										An unexpected error occurred. Our team has been automatically notified.
									</CardDescription>
								</div>
							</div>
						</CardHeader>

						<CardContent className="space-y-4">
							{this.props.showDetails && this.state.error && (
								<div className="space-y-3">
									<div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
										<h3 className="font-semibold text-red-800 dark:text-red-200 mb-2">
											Error Details:
										</h3>
										<p className="text-sm text-red-700 dark:text-red-300 font-mono break-all">
											{this.state.error.message}
										</p>
									</div>

									{this.state.error.stack && (
										<details className="cursor-pointer">
											<summary className="text-sm font-medium text-muted-foreground hover:text-foreground">
												View Stack Trace
											</summary>
											<pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs">
												{this.state.error.stack}
											</pre>
										</details>
									)}
								</div>
							)}

							<div className="p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg">
								<div className="flex items-start gap-2">
									<div className="h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mt-0.5 flex-shrink-0">
										<span className="text-xs font-bold text-blue-600 dark:text-blue-400">i</span>
									</div>
									<div>
										<h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm mb-1">
											What you can do:
										</h4>
										<ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
											<li>• Try refreshing the page to see if the issue resolves</li>
											<li>• Go back to the home page and try again</li>
											<li>• If the problem persists, contact support</li>
											<li>
												• This error has been automatically reported and will be investigated
											</li>
										</ul>
									</div>
								</div>
							</div>
						</CardContent>

						<CardFooter className="flex gap-3">
							<Button onClick={this.handleReset} variant="default" className="flex items-center gap-2">
								<RefreshCcw className="h-4 w-4" />
								Try Again
							</Button>
							<Button onClick={this.handleGoHome} variant="outline" className="flex items-center gap-2">
								<Home className="h-4 w-4" />
								Go to Home
							</Button>
						</CardFooter>
					</Card>
				</div>
			)
		}

		return this.props.children
	}
}

/**
 * Functional component wrapper for easier usage with hooks
 */
export function ErrorBoundary({
	children,
	fallback,
	onError,
	showDetails = process.env.NODE_ENV === 'development'
}: Props) {
	return (
		<ErrorBoundaryWithReporter fallback={fallback} onError={onError} showDetails={showDetails}>
			{children}
		</ErrorBoundaryWithReporter>
	)
}
