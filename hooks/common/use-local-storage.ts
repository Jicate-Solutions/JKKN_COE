import { useState, useEffect, useCallback } from 'react'

/**
 * Custom hook for syncing state with localStorage
 *
 * @example
 * const [theme, setTheme] = useLocalStorage('theme', 'light')
 * setTheme('dark') // Automatically syncs to localStorage
 */
export function useLocalStorage<T>(
	key: string,
	initialValue: T
): [T, (value: T | ((val: T) => T)) => void, () => void] {
	// Get initial value from localStorage or use default
	const [storedValue, setStoredValue] = useState<T>(() => {
		if (typeof window === 'undefined') {
			return initialValue
		}

		try {
			const item = window.localStorage.getItem(key)
			return item ? JSON.parse(item) : initialValue
		} catch (error) {
			console.error(`Error reading localStorage key "${key}":`, error)
			return initialValue
		}
	})

	// Update localStorage when value changes
	const setValue = useCallback(
		(value: T | ((val: T) => T)) => {
			try {
				// Read current value from localStorage to avoid stale closure on storedValue
				const currentValue = JSON.parse(window.localStorage.getItem(key) || 'null') as T ?? initialValue
				const valueToStore = value instanceof Function ? value(currentValue) : value

				setStoredValue(valueToStore)

				if (typeof window !== 'undefined') {
					window.localStorage.setItem(key, JSON.stringify(valueToStore))
					// Dispatch storage event for cross-tab sync
					window.dispatchEvent(new Event('local-storage'))
				}
			} catch (error) {
				console.error(`Error setting localStorage key "${key}":`, error)
			}
		},
		[key, initialValue]
	)

	// Remove item from localStorage
	const removeValue = useCallback(() => {
		try {
			setStoredValue(initialValue)
			if (typeof window !== 'undefined') {
				window.localStorage.removeItem(key)
				window.dispatchEvent(new Event('local-storage'))
			}
		} catch (error) {
			console.error(`Error removing localStorage key "${key}":`, error)
		}
	}, [key, initialValue])

	// Listen for changes in other tabs/windows
	useEffect(() => {
		const handleStorageChange = (e: StorageEvent | Event) => {
			if (e instanceof StorageEvent && e.key === key && e.newValue !== null) {
				try {
					setStoredValue(JSON.parse(e.newValue))
				} catch (error) {
					console.error(`Error parsing localStorage value for key "${key}":`, error)
				}
			} else if (e.type === 'local-storage') {
				// Custom event for same-tab updates
				try {
					const item = window.localStorage.getItem(key)
					if (item !== null) {
						setStoredValue(JSON.parse(item))
					}
				} catch (error) {
					console.error(`Error reading localStorage key "${key}":`, error)
				}
			}
		}

		window.addEventListener('storage', handleStorageChange)
		window.addEventListener('local-storage', handleStorageChange)

		return () => {
			window.removeEventListener('storage', handleStorageChange)
			window.removeEventListener('local-storage', handleStorageChange)
		}
	}, [key])

	return [storedValue, setValue, removeValue]
}
