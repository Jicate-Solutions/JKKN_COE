import { useState, useEffect } from 'react'

/**
 * Custom hook for detecting key presses
 *
 * @example
 * const enterPressed = useKeyPress('Enter')
 * const escapePressed = useKeyPress('Escape')
 *
 * useEffect(() => {
 *   if (enterPressed) {
 *     handleSubmit()
 *   }
 * }, [enterPressed])
 */
export function useKeyPress(targetKey: string): boolean {
	const [keyPressed, setKeyPressed] = useState(false)

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === targetKey) {
				setKeyPressed(true)
			}
		}

		const handleKeyUp = (event: KeyboardEvent) => {
			if (event.key === targetKey) {
				setKeyPressed(false)
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
		}
	}, [targetKey])

	return keyPressed
}

/**
 * Hook for detecting key combinations (e.g., Ctrl+S, Cmd+K)
 *
 * @example
 * useKeyCombo(['Control', 's'], () => {
 *   event.preventDefault()
 *   handleSave()
 * })
 */
export function useKeyCombo(
	keys: string[],
	callback: (event: KeyboardEvent) => void,
	options: { preventDefault?: boolean } = {}
): void {
	const { preventDefault = true } = options

	useEffect(() => {
		const pressedKeys = new Set<string>()

		const handleKeyDown = (event: KeyboardEvent) => {
			pressedKeys.add(event.key)

			// Check if all required keys are pressed
			const allKeysPressed = keys.every((key) => pressedKeys.has(key))

			if (allKeysPressed) {
				if (preventDefault) {
					event.preventDefault()
				}
				callback(event)
			}
		}

		const handleKeyUp = (event: KeyboardEvent) => {
			pressedKeys.delete(event.key)
		}

		// Clear on window blur
		const handleBlur = () => {
			pressedKeys.clear()
		}

		window.addEventListener('keydown', handleKeyDown)
		window.addEventListener('keyup', handleKeyUp)
		window.addEventListener('blur', handleBlur)

		return () => {
			window.removeEventListener('keydown', handleKeyDown)
			window.removeEventListener('keyup', handleKeyUp)
			window.removeEventListener('blur', handleBlur)
		}
	}, [keys, callback, preventDefault])
}
