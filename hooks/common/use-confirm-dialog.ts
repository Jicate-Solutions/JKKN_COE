import { useState, useCallback } from 'react'

interface ConfirmDialogState {
  isOpen: boolean
  itemId: string | null
  itemName?: string

  // Actions
  openDialog: (id: string, name?: string) => void
  closeDialog: () => void
  confirm: () => string | null
  cancel: () => void
}

/**
 * Custom hook for managing confirm dialog state (e.g., delete confirmation)
 *
 * @example
 * const { isOpen, itemId, itemName, openDialog, closeDialog, confirm } = useConfirmDialog()
 *
 * // Open dialog
 * <Button onClick={() => openDialog(course.id, course.course_title)}>
 *   Delete
 * </Button>
 *
 * // In dialog
 * <AlertDialog open={isOpen} onOpenChange={closeDialog}>
 *   <AlertDialogContent>
 *     <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
 *     <AlertDialogDescription>
 *       Are you sure you want to delete {itemName}?
 *     </AlertDialogDescription>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel onClick={cancel}>Cancel</AlertDialogCancel>
 *       <AlertDialogAction onClick={() => {
 *         const id = confirm()
 *         if (id) deleteCourse(id)
 *       }}>
 *         Delete
 *       </AlertDialogAction>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>
 */
export function useConfirmDialog(): ConfirmDialogState {
  const [isOpen, setIsOpen] = useState(false)
  const [itemId, setItemId] = useState<string | null>(null)
  const [itemName, setItemName] = useState<string | undefined>(undefined)

  const openDialog = useCallback((id: string, name?: string) => {
    setItemId(id)
    setItemName(name)
    setIsOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setIsOpen(false)
    // Delay reset to allow closing animation
    setTimeout(() => {
      setItemId(null)
      setItemName(undefined)
    }, 200)
  }, [])

  const confirm = useCallback((): string | null => {
    const id = itemId
    closeDialog()
    return id
  }, [itemId, closeDialog])

  const cancel = useCallback(() => {
    closeDialog()
  }, [closeDialog])

  return {
    isOpen,
    itemId,
    itemName,
    openDialog,
    closeDialog,
    confirm,
    cancel
  }
}
