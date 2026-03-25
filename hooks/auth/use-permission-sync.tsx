'use client'

import { useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useToast } from '@/hooks/common/use-toast'

/**
 * Real-time Permission Synchronization Hook
 *
 * This hook listens for changes to user_roles table and automatically refreshes
 * the user's permissions without requiring logout/login.
 *
 * Features:
 * - Subscribes to user_roles table changes via Supabase Realtime
 * - Detects INSERT, UPDATE, DELETE operations for current user
 * - Automatically refreshes permissions from server
 * - Updates auth context with new roles and permissions
 * - Shows toast notification when permissions change
 * - Cleans up subscription on unmount
 *
 * @param userId - Current user's ID
 * @param onPermissionsChanged - Callback to refresh auth context
 */
export function usePermissionSync(
  userId: string | undefined,
  onPermissionsChanged: () => Promise<void>
) {
  const { toast } = useToast()

  const handlePermissionChange = useCallback(async () => {
    try {
      console.log('Permission change detected, refreshing...')

      // Call the callback to refresh permissions
      await onPermissionsChanged()

      // Show notification
      toast({
        title: '🔄 Permissions Updated',
        description: 'Your access permissions have been updated. The menu will refresh automatically.',
        className: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
        duration: 5000,
      })
    } catch (error) {
      console.error('Error refreshing permissions:', error)
    }
  }, [onPermissionsChanged, toast])

  useEffect(() => {
    if (!userId) return

    // Create Supabase client for realtime
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase credentials missing, real-time sync disabled')
      return
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    console.log('Setting up real-time permission sync for user:', userId)

    // Subscribe to user_roles changes for current user
    const channel = supabase
      .channel(`user_roles_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          console.log('User roles changed:', payload)
          handlePermissionChange()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time permission sync active')
        } else if (status === 'CHANNEL_ERROR') {
          console.warn('⚠️ Real-time channel error - Enable realtime for user_roles table in Supabase Dashboard')
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Real-time subscription timed out')
        }
      })

    // Cleanup subscription on unmount
    return () => {
      console.log('Cleaning up real-time permission sync')
      supabase.removeChannel(channel)
    }
  }, [userId, handlePermissionChange])
}
