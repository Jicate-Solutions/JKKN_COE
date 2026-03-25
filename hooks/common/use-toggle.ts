import { useState, useCallback } from 'react'

/**
 * Custom hook for managing boolean toggle state
 *
 * @example
 * const [isOpen, toggle, setIsOpen] = useToggle(false)
 * toggle() // Toggles between true/false
 * setIsOpen(true) // Set to specific value
 */
export function useToggle(
	initialValue = false
): [boolean, () => void, (value: boolean) => void] {
	const [value, setValue] = useState(initialValue)

	const toggle = useCallback(() => {
		setValue((v) => !v)
	}, [])

	const setExplicitValue = useCallback((newValue: boolean) => {
		setValue(newValue)
	}, [])

	return [value, toggle, setExplicitValue]
}
