'use client'

import { useAuth } from '@/context/auth-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
	User,
	Mail,
	Shield,
	Building2,
	Clock,
	Key,
	CheckCircle2,
	XCircle,
	RefreshCw,
	LogOut,
	Copy,
	Check,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import Cookies from 'js-cookie'

export default function SessionDetailsPage() {
	const { user, isAuthenticated, loading, logout, refreshSession, getAccessToken, hasPermission, hasRole } = useAuth()
	const [copied, setCopied] = useState<string | null>(null)
	const [authTimestamp, setAuthTimestamp] = useState<string | null>(null)
	const [tokenExpiry, setTokenExpiry] = useState<string | null>(null)
	const [refreshing, setRefreshing] = useState(false)

	useEffect(() => {
		// Get auth timestamp from localStorage
		const timestamp = localStorage.getItem('auth_timestamp')
		if (timestamp) {
			setAuthTimestamp(new Date(parseInt(timestamp)).toLocaleString())
		}

		// Check token expiry from cookie
		const accessToken = Cookies.get('access_token')
		if (accessToken) {
			// Try to decode JWT to get expiry (if it's a JWT)
			try {
				const parts = accessToken.split('.')
				if (parts.length === 3) {
					const payload = JSON.parse(atob(parts[1]))
					if (payload.exp) {
						setTokenExpiry(new Date(payload.exp * 1000).toLocaleString())
					}
				}
			} catch {
				// Not a JWT or invalid format
				setTokenExpiry('Unknown')
			}
		}
	}, [])

	const copyToClipboard = (text: string, field: string) => {
		navigator.clipboard.writeText(text)
		setCopied(field)
		setTimeout(() => setCopied(null), 2000)
	}

	const handleRefreshSession = async () => {
		setRefreshing(true)
		await refreshSession()
		setRefreshing(false)
	}

	const getInitials = (name: string) => {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2)
	}

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (!isAuthenticated || !user) {
		return (
			<div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
				<XCircle className="h-16 w-16 text-red-500" />
				<h2 className="text-2xl font-bold">Not Authenticated</h2>
				<p className="text-muted-foreground">Please log in to view session details.</p>
			</div>
		)
	}

	const accessToken = getAccessToken()

	return (
		<div className="container mx-auto py-8 px-4 max-w-5xl">
			<div className="mb-8">
				<h1 className="text-3xl font-bold font-heading">Session Details</h1>
				<p className="text-muted-foreground mt-2">View your current session and user information</p>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				{/* User Profile Card */}
				<Card className="md:col-span-2">
					<CardHeader>
						<div className="flex items-center gap-4">
							<Avatar className="h-20 w-20">
								<AvatarImage src={user.avatar_url} alt={user.full_name} />
								<AvatarFallback className="text-xl">{getInitials(user.full_name)}</AvatarFallback>
							</Avatar>
							<div>
								<CardTitle className="text-2xl">{user.full_name}</CardTitle>
								<CardDescription className="text-base">{user.email}</CardDescription>
								<div className="flex gap-2 mt-2">
									<Badge variant={user.is_active ? 'default' : 'destructive'}>
										{user.is_active ? 'Active' : 'Inactive'}
									</Badge>
									{user.is_super_admin && <Badge variant="secondary">Super Admin</Badge>}
									<Badge variant="outline">{user.role}</Badge>
								</div>
							</div>
						</div>
					</CardHeader>
				</Card>

				{/* User Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<User className="h-5 w-5" />
							User Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-3">
							<DetailRow
								label="User ID"
								value={user.id}
								copyable
								onCopy={() => copyToClipboard(user.id, 'id')}
								copied={copied === 'id'}
							/>
							<Separator />
							<DetailRow label="Full Name" value={user.full_name} />
							<Separator />
							<DetailRow label="First Name" value={user.first_name || 'N/A'} />
							<Separator />
							<DetailRow label="Last Name" value={user.last_name || 'N/A'} />
							<Separator />
							<DetailRow
								label="Email"
								value={user.email}
								copyable
								onCopy={() => copyToClipboard(user.email, 'email')}
								copied={copied === 'email'}
							/>
							<Separator />
							<DetailRow label="Avatar URL" value={user.avatar_url || 'N/A'} truncate />
						</div>
					</CardContent>
				</Card>

				{/* Institution Details */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Building2 className="h-5 w-5" />
							Institution Details
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-3">
							<DetailRow
								label="Institution ID"
								value={user.institution_id || 'N/A'}
								copyable={!!user.institution_id}
								onCopy={() => user.institution_id && copyToClipboard(user.institution_id, 'inst_id')}
								copied={copied === 'inst_id'}
							/>
							<Separator />
							<DetailRow label="Institution Code" value={user.institution_code || 'N/A'} />
							<Separator />
							<DetailRow label="Department Code" value={user.department_code || 'N/A'} />
						</div>
					</CardContent>
				</Card>

				{/* Roles & Permissions */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-5 w-5" />
							Roles & Permissions
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label className="text-sm font-medium text-muted-foreground">Primary Role</label>
							<div className="mt-1">
								<Badge variant="default" className="text-sm">
									{user.role}
								</Badge>
							</div>
						</div>
						<Separator />
						<div>
							<label className="text-sm font-medium text-muted-foreground">Additional Roles</label>
							<div className="mt-2 flex flex-wrap gap-2">
								{user.roles && user.roles.length > 0 ? (
									user.roles.map((role) => (
										<Badge key={role} variant="secondary">
											{role}
										</Badge>
									))
								) : (
									<span className="text-sm text-muted-foreground">No additional roles</span>
								)}
							</div>
						</div>
						<Separator />
						<div>
							<label className="text-sm font-medium text-muted-foreground">Permissions ({user.permissions?.length || 0})</label>
							<div className="mt-2 flex flex-wrap gap-2 max-h-32 overflow-y-auto">
								{user.permissions && user.permissions.length > 0 ? (
									user.permissions.map((permission) => (
										<Badge key={permission} variant="outline" className="text-xs">
											{permission}
										</Badge>
									))
								) : (
									<span className="text-sm text-muted-foreground">No permissions assigned</span>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Session Information */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Key className="h-5 w-5" />
							Session Information
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-muted-foreground">Authentication Status</label>
								<Badge variant={isAuthenticated ? 'default' : 'destructive'} className="flex items-center gap-1">
									{isAuthenticated ? (
										<>
											<CheckCircle2 className="h-3 w-3" /> Authenticated
										</>
									) : (
										<>
											<XCircle className="h-3 w-3" /> Not Authenticated
										</>
									)}
								</Badge>
							</div>
							<Separator />
							<DetailRow label="Auth Timestamp" value={authTimestamp || 'N/A'} />
							<Separator />
							<DetailRow label="Token Expiry" value={tokenExpiry || 'N/A'} />
							<Separator />
							<DetailRow label="Last Login" value={user.last_login ? new Date(user.last_login).toLocaleString() : 'N/A'} />
							<Separator />
							<div className="flex items-center justify-between">
								<label className="text-sm font-medium text-muted-foreground">Access Token</label>
								<div className="flex items-center gap-2">
									<Badge variant={accessToken ? 'default' : 'destructive'}>{accessToken ? 'Present' : 'Missing'}</Badge>
									{accessToken && (
										<Button
											size="sm"
											variant="ghost"
											className="h-6 px-2"
											onClick={() => copyToClipboard(accessToken, 'token')}
										>
											{copied === 'token' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
										</Button>
									)}
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Account Status */}
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Clock className="h-5 w-5" />
							Account Status & Actions
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<div className="p-4 rounded-lg bg-muted/50">
								<label className="text-sm font-medium text-muted-foreground">Account Active</label>
								<div className="mt-2 flex items-center gap-2">
									{user.is_active ? (
										<CheckCircle2 className="h-5 w-5 text-green-500" />
									) : (
										<XCircle className="h-5 w-5 text-red-500" />
									)}
									<span className="font-medium">{user.is_active ? 'Yes' : 'No'}</span>
								</div>
							</div>
							<div className="p-4 rounded-lg bg-muted/50">
								<label className="text-sm font-medium text-muted-foreground">Super Admin</label>
								<div className="mt-2 flex items-center gap-2">
									{user.is_super_admin ? (
										<CheckCircle2 className="h-5 w-5 text-green-500" />
									) : (
										<XCircle className="h-5 w-5 text-muted-foreground" />
									)}
									<span className="font-medium">{user.is_super_admin ? 'Yes' : 'No'}</span>
								</div>
							</div>
							<div className="p-4 rounded-lg bg-muted/50">
								<label className="text-sm font-medium text-muted-foreground">Refresh Session</label>
								<div className="mt-2">
									<Button size="sm" variant="outline" onClick={handleRefreshSession} disabled={refreshing}>
										{refreshing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
										Refresh
									</Button>
								</div>
							</div>
							<div className="p-4 rounded-lg bg-muted/50">
								<label className="text-sm font-medium text-muted-foreground">Sign Out</label>
								<div className="mt-2">
									<Button size="sm" variant="destructive" onClick={() => logout()}>
										<LogOut className="h-4 w-4 mr-2" />
										Logout
									</Button>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Raw User Data */}
				<Card className="md:col-span-2">
					<CardHeader>
						<CardTitle>Raw User Data (JSON)</CardTitle>
						<CardDescription>Complete user object from the authentication context</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="relative">
							<pre className="p-4 bg-muted rounded-lg overflow-auto max-h-96 text-sm">
								{JSON.stringify(user, null, 2)}
							</pre>
							<Button
								size="sm"
								variant="secondary"
								className="absolute top-2 right-2"
								onClick={() => copyToClipboard(JSON.stringify(user, null, 2), 'json')}
							>
								{copied === 'json' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	)
}

interface DetailRowProps {
	label: string
	value: string
	copyable?: boolean
	onCopy?: () => void
	copied?: boolean
	truncate?: boolean
}

function DetailRow({ label, value, copyable, onCopy, copied, truncate }: DetailRowProps) {
	return (
		<div className="flex items-center justify-between gap-4">
			<label className="text-sm font-medium text-muted-foreground whitespace-nowrap">{label}</label>
			<div className="flex items-center gap-2 min-w-0">
				<span className={`text-sm font-mono ${truncate ? 'truncate max-w-[200px]' : ''}`} title={value}>
					{value}
				</span>
				{copyable && onCopy && (
					<Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={onCopy}>
						{copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
					</Button>
				)}
			</div>
		</div>
	)
}
