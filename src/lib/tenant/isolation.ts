import { NextRequest, NextResponse } from 'next/server'
import { getTenantContext } from '@/lib/auth/clerk'
import type { TenantContext } from './types'

export type ApiHandler<T = unknown> = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>>; tenant: TenantContext }
) => Promise<NextResponse<T>>

export function requireTenant<T>(handler: ApiHandler<T>): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse<T | { error: string }>> {
  return async (req, ctx) => {
    const tenant = await getTenantContext()
    if (!tenant) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    return handler(req, { ...ctx, tenant })
  }
}

export function requireRole<T>(
  roles: Array<'owner' | 'admin' | 'editor' | 'viewer'>,
  handler: ApiHandler<T>
): (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<NextResponse<T | { error: string }>> {
  return async (req, ctx) => {
    const tenant = await getTenantContext()
    if (!tenant) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    if (!roles.includes(tenant.userRole)) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }
    return handler(req, { ...ctx, tenant })
  }
}

export function canEditContent(role: TenantContext['userRole']): boolean {
  return ['owner', 'admin', 'editor'].includes(role)
}

export function canManageTeam(role: TenantContext['userRole']): boolean {
  return ['owner', 'admin'].includes(role)
}

export function canManageBilling(role: TenantContext['userRole']): boolean {
  return role === 'owner'
}

export function canManageSettings(role: TenantContext['userRole']): boolean {
  return ['owner', 'admin'].includes(role)
}
