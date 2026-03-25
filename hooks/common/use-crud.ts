import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/common/use-toast'

interface UseCRUDOptions<T> {
  apiEndpoint: string
  entityName?: string
  onCreateSuccess?: (item: T) => void
  onUpdateSuccess?: (item: T) => void
  onDeleteSuccess?: (id: string) => void
  fetchOnMount?: boolean
}

interface CRUDResponse<T> {
  items: T[]
  loading: boolean
  error: Error | null
  creating: boolean
  updating: boolean
  deleting: boolean

  // CRUD operations
  fetchItems: () => Promise<void>
  createItem: (data: Partial<T>) => Promise<T | null>
  updateItem: (id: string, data: Partial<T>) => Promise<T | null>
  deleteItem: (id: string) => Promise<boolean>
  refreshItems: () => Promise<void>

  // Utility
  setItems: React.Dispatch<React.SetStateAction<T[]>>
}

/**
 * Custom hook for CRUD operations on any entity
 *
 * @example
 * const {
 *   items: courses,
 *   loading,
 *   createItem,
 *   updateItem,
 *   deleteItem,
 *   refreshItems
 * } = useCRUD<Course>({
 *   apiEndpoint: '/api/courses',
 *   entityName: 'Course'
 * })
 *
 * // Create
 * await createItem(newCourseData)
 *
 * // Update
 * await updateItem(course.id, updatedData)
 *
 * // Delete
 * await deleteItem(course.id)
 */
export function useCRUD<T extends { id: string }>(
  options: UseCRUDOptions<T>
): CRUDResponse<T> {
  const {
    apiEndpoint,
    entityName = 'Item',
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    fetchOnMount = true
  } = options

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { toast } = useToast()

  // Fetch all items
  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(apiEndpoint)

      if (!response.ok) {
        throw new Error(`Failed to fetch ${entityName}s`)
      }

      const data = await response.json()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)

      toast({
        title: `❌ Fetch Failed`,
        description: error.message,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, entityName, toast])

  // Create item
  const createItem = useCallback(async (data: Partial<T>): Promise<T | null> => {
    setCreating(true)
    setError(null)

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to create ${entityName}`)
      }

      const newItem = await response.json()
      setItems(prev => [newItem, ...prev])

      toast({
        title: `✅ ${entityName} Created`,
        description: `Successfully created ${entityName.toLowerCase()}.`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })

      if (onCreateSuccess) {
        onCreateSuccess(newItem)
      }

      return newItem
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)

      toast({
        title: `❌ Create Failed`,
        description: error.message,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })

      return null
    } finally {
      setCreating(false)
    }
  }, [apiEndpoint, entityName, toast, onCreateSuccess])

  // Update item
  const updateItem = useCallback(async (id: string, data: Partial<T>): Promise<T | null> => {
    setUpdating(true)
    setError(null)

    try {
      const response = await fetch(`${apiEndpoint}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to update ${entityName}`)
      }

      const updatedItem = await response.json()
      setItems(prev => prev.map(item => item.id === id ? updatedItem : item))

      toast({
        title: `✅ ${entityName} Updated`,
        description: `Successfully updated ${entityName.toLowerCase()}.`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })

      if (onUpdateSuccess) {
        onUpdateSuccess(updatedItem)
      }

      return updatedItem
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)

      toast({
        title: `❌ Update Failed`,
        description: error.message,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })

      return null
    } finally {
      setUpdating(false)
    }
  }, [apiEndpoint, entityName, toast, onUpdateSuccess])

  // Delete item
  const deleteItem = useCallback(async (id: string): Promise<boolean> => {
    setDeleting(true)
    setError(null)

    try {
      const response = await fetch(`${apiEndpoint}/${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to delete ${entityName}`)
      }

      setItems(prev => prev.filter(item => item.id !== id))

      toast({
        title: `✅ ${entityName} Deleted`,
        description: `Successfully deleted ${entityName.toLowerCase()}.`,
        className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
      })

      if (onDeleteSuccess) {
        onDeleteSuccess(id)
      }

      return true
    } catch (err) {
      const error = err instanceof Error ? err : new Error('An error occurred')
      setError(error)

      toast({
        title: `❌ Delete Failed`,
        description: error.message,
        variant: 'destructive',
        className: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
      })

      return false
    } finally {
      setDeleting(false)
    }
  }, [apiEndpoint, entityName, toast, onDeleteSuccess])

  // Refresh items (alias for fetchItems)
  const refreshItems = useCallback(async () => {
    await fetchItems()
  }, [fetchItems])

  // Fetch on mount
  useEffect(() => {
    if (fetchOnMount) {
      fetchItems()
    }
  }, [fetchOnMount, fetchItems])

  return {
    items,
    loading,
    error,
    creating,
    updating,
    deleting,
    fetchItems,
    createItem,
    updateItem,
    deleteItem,
    refreshItems,
    setItems
  }
}
