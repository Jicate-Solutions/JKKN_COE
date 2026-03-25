"use client"

/**
 * Example React Component: Fetch Large Dataset with Progress
 * Shows how to use fetchAllRowsWithProgress in a UI component
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Download } from 'lucide-react'

export function FetchLargeDatasetExample() {
	const [loading, setLoading] = useState(false)
	const [progress, setProgress] = useState(0)
	const [total, setTotal] = useState<number | undefined>()
	const [loaded, setLoaded] = useState(0)
	const [data, setData] = useState<any[]>([])

	const handleFetchAllStudents = async () => {
		try {
			setLoading(true)
			setProgress(0)
			setLoaded(0)
			setTotal(undefined)

			// Call API endpoint that uses fetchAllRowsWithProgress
			const response = await fetch('/api/students/fetch-all-with-progress')

			if (!response.ok) {
				throw new Error('Failed to fetch students')
			}

			// If using streaming response
			const reader = response.body?.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			let allStudents: any[] = []

			if (reader) {
				while (true) {
					const { done, value } = await reader.read()

					if (done) break

					buffer += decoder.decode(value, { stream: true })

					// Process newline-delimited JSON chunks
					const lines = buffer.split('\n')
					buffer = lines.pop() || ''

					for (const line of lines) {
						if (line.trim()) {
							const chunk = JSON.parse(line)

							if (chunk.type === 'progress') {
								setLoaded(chunk.loaded)
								setTotal(chunk.total)
								setProgress(chunk.total ? (chunk.loaded / chunk.total) * 100 : 0)
							} else if (chunk.type === 'batch') {
								allStudents = [...allStudents, ...chunk.data]
							} else if (chunk.type === 'complete') {
								setData(allStudents)
							}
						}
					}
				}
			}

		} catch (error) {
			console.error('Error fetching students:', error)
			alert('Failed to fetch students')
		} finally {
			setLoading(false)
		}
	}

	const handleFetchAllSimple = async () => {
		try {
			setLoading(true)

			const response = await fetch('/api/students/fetch-all')

			if (!response.ok) {
				throw new Error('Failed to fetch students')
			}

			const result = await response.json()
			setData(result.data)
			setTotal(result.count)

		} catch (error) {
			console.error('Error fetching students:', error)
			alert('Failed to fetch students')
		} finally {
			setLoading(false)
		}
	}

	const progressPercentage = total && loaded ? Math.round((loaded / total) * 100) : 0

	return (
		<Card>
			<CardHeader>
				<CardTitle>Fetch Large Dataset Example</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Action Buttons */}
				<div className="flex gap-2">
					<Button
						onClick={handleFetchAllSimple}
						disabled={loading}
						variant="outline"
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Fetching...
							</>
						) : (
							<>
								<Download className="mr-2 h-4 w-4" />
								Fetch All (Simple)
							</>
						)}
					</Button>

					<Button
						onClick={handleFetchAllStudents}
						disabled={loading}
					>
						{loading ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								Fetching with Progress...
							</>
						) : (
							<>
								<Download className="mr-2 h-4 w-4" />
								Fetch All (With Progress)
							</>
						)}
					</Button>
				</div>

				{/* Progress Indicator */}
				{loading && total && (
					<div className="space-y-2">
						<div className="flex justify-between text-sm text-muted-foreground">
							<span>Loading students...</span>
							<span>{loaded.toLocaleString()} / {total.toLocaleString()} ({progressPercentage}%)</span>
						</div>
						<Progress value={progressPercentage} />
					</div>
				)}

				{/* Results */}
				{data.length > 0 && (
					<div className="space-y-2">
						<div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
							<span className="font-semibold text-green-800">
								Successfully fetched {data.length.toLocaleString()} records
							</span>
						</div>

						{/* Sample Data Preview */}
						<div className="border rounded-lg p-3 bg-muted/30 max-h-60 overflow-y-auto">
							<p className="text-sm font-medium mb-2">First 5 records:</p>
							<pre className="text-xs">
								{JSON.stringify(data.slice(0, 5), null, 2)}
							</pre>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	)
}
