import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, activityLog } from '@/lib/db'
import { eq, desc, and, gte, lte } from 'drizzle-orm'

export const GET = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const action = searchParams.get('action')
  const entityType = searchParams.get('entityType')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  let whereClause = eq(activityLog.tenantId, tenant.tenantId)

  if (action) {
    whereClause = and(whereClause, eq(activityLog.action, action))!
  }
  if (entityType) {
    whereClause = and(whereClause, eq(activityLog.entityType, entityType))!
  }
  if (startDate) {
    whereClause = and(whereClause, gte(activityLog.createdAt, new Date(startDate)))!
  }
  if (endDate) {
    whereClause = and(whereClause, lte(activityLog.createdAt, new Date(endDate)))!
  }

  const [activities, totalCount] = await Promise.all([
    db.query.activityLog.findMany({
      where: whereClause,
      orderBy: [desc(activityLog.createdAt)],
      limit,
      offset,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    }),
    db.$count(activityLog, whereClause)
  ])

  return NextResponse.json({
    activities,
    total: totalCount,
    limit,
    offset
  })
})
