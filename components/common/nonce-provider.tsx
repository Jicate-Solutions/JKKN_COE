'use client'

import { createContext, useContext } from 'react'

const NonceContext = createContext<string>('')

export function NonceProvider({
	nonce,
	children,
}: {
	nonce: string
	children: React.ReactNode
}) {
	return (
		<NonceContext.Provider value={nonce}>
			{children}
		</NonceContext.Provider>
	)
}

/**
 * Hook to access the CSP nonce in client components.
 * Use this when rendering <Script> tags that need a nonce attribute.
 */
export function useNonce(): string {
	return useContext(NonceContext)
}
