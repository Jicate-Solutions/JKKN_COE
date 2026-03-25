import { useState, useCallback } from 'react'

interface UseSheetOptions<T> {
  onOpen?: (item?: T) => void
  onClose?: () => void
  resetFormOnClose?: boolean
}

interface SheetState<T> {
  isOpen: boolean
  isEditing: boolean
  editingItem: T | null

  // Actions
  open: (item?: T) => void
  close: () => void
  openForCreate: () => void
  openForEdit: (item: T) => void
  toggle: () => void
}

/**
 * Custom hook for managing sheet/modal state and edit mode
 *
 * @example
 * const { isOpen, isEditing, editingItem, open, close, openForEdit } = useSheet<Course>()
 *
 * // Open for create
 * open()
 *
 * // Open for edit
 * openForEdit(course)
 *
 * // Close
 * close()
 */
export function useSheet<T = any>(options: UseSheetOptions<T> = {}): SheetState<T> {
  const { onOpen, onClose, resetFormOnClose = true } = options

  const [isOpen, setIsOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<T | null>(null)

  const isEditing = editingItem !== null

  // Open sheet (generic)
  const open = useCallback((item?: T) => {
    setIsOpen(true)
    setEditingItem(item || null)

    if (onOpen) {
      onOpen(item)
    }
  }, [onOpen])

  // Close sheet
  const close = useCallback(() => {
    setIsOpen(false)

    if (resetFormOnClose) {
      // Delay reset to allow closing animation
      setTimeout(() => {
        setEditingItem(null)
      }, 200)
    }

    if (onClose) {
      onClose()
    }
  }, [onClose, resetFormOnClose])

  // Open for create
  const openForCreate = useCallback(() => {
    open()
  }, [open])

  // Open for edit
  const openForEdit = useCallback((item: T) => {
    open(item)
  }, [open])

  // Toggle
  const toggle = useCallback(() => {
    if (isOpen) {
      close()
    } else {
      open()
    }
  }, [isOpen, open, close])

  return {
    isOpen,
    isEditing,
    editingItem,
    open,
    close,
    openForCreate,
    openForEdit,
    toggle
  }
}
