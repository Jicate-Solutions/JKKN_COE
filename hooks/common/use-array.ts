import { useState, useCallback } from 'react'

/**
 * Custom hook for array state management with utility methods
 *
 * @example
 * const { array, set, push, remove, filter, update, clear } = useArray<Course>([])
 *
 * push(newCourse)
 * remove((c) => c.id === courseId)
 * update((c) => c.id === courseId, updatedCourse)
 */
export function useArray<T>(initialArray: T[] = []) {
	const [array, setArray] = useState<T[]>(initialArray)

	// Set entire array
	const set = useCallback((newArray: T[]) => {
		setArray(newArray)
	}, [])

	// Add item to end
	const push = useCallback((item: T) => {
		setArray((prev) => [...prev, item])
	}, [])

	// Add item to beginning
	const unshift = useCallback((item: T) => {
		setArray((prev) => [item, ...prev])
	}, [])

	// Remove item(s) by filter function
	const remove = useCallback((filterFn: (item: T, index: number) => boolean) => {
		setArray((prev) => prev.filter((item, i) => !filterFn(item, i)))
	}, [])

	// Remove item at specific index
	const removeAt = useCallback((index: number) => {
		setArray((prev) => prev.filter((_, i) => i !== index))
	}, [])

	// Filter array
	const filter = useCallback((filterFn: (item: T, index: number) => boolean) => {
		setArray((prev) => prev.filter(filterFn))
	}, [])

	// Update item(s) by filter function
	const update = useCallback(
		(filterFn: (item: T, index: number) => boolean, updates: Partial<T> | ((item: T) => T)) => {
			setArray((prev) =>
				prev.map((item, i) => {
					if (filterFn(item, i)) {
						return typeof updates === 'function'
							? updates(item)
							: { ...item, ...updates }
					}
					return item
				})
			)
		},
		[]
	)

	// Update item at specific index
	const updateAt = useCallback((index: number, updates: Partial<T> | ((item: T) => T)) => {
		setArray((prev) =>
			prev.map((item, i) => {
				if (i === index) {
					return typeof updates === 'function' ? updates(item) : { ...item, ...updates }
				}
				return item
			})
		)
	}, [])

	// Clear array
	const clear = useCallback(() => {
		setArray([])
	}, [])

	// Sort array
	const sort = useCallback((compareFn?: (a: T, b: T) => number) => {
		setArray((prev) => [...prev].sort(compareFn))
	}, [])

	// Reverse array
	const reverse = useCallback(() => {
		setArray((prev) => [...prev].reverse())
	}, [])

	// Insert at specific index
	const insertAt = useCallback((index: number, item: T) => {
		setArray((prev) => {
			const newArray = [...prev]
			newArray.splice(index, 0, item)
			return newArray
		})
	}, [])

	// Move item from one index to another
	const move = useCallback((fromIndex: number, toIndex: number) => {
		setArray((prev) => {
			const newArray = [...prev]
			const [item] = newArray.splice(fromIndex, 1)
			newArray.splice(toIndex, 0, item)
			return newArray
		})
	}, [])

	return {
		array,
		set,
		push,
		unshift,
		remove,
		removeAt,
		filter,
		update,
		updateAt,
		clear,
		sort,
		reverse,
		insertAt,
		move
	}
}
