import { NextRequest, NextResponse } from 'next/server'
import { requireTenant } from '@/lib/tenant/isolation'
import { db, performanceSnapshots, articles } from '@/lib/db'
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm'

export const GET = requireTenant(async (req, { tenant }) => {
  const { searchParams } = new URL(req.url)
  const articleId = searchParams.get('articleId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const limit = parseInt(searchParams.get('limit') || '100')

  let whereClause = eq(performanceSnapshots.tenantId, tenant.tenantId)

  if (articleId) {
    whereClause = and(whereClause, eq(performanceSnapshots.articleId, articleId))!
  }
  if (startDate) {
    whereClause = and(whereClause, gte(performanceSnapshots.snapshotDate, startDate))!
  }
  if (endDate) {
    whereClause = and(whereClause, lte(performanceSnapshots.snapshotDate, endDate))!
  }

  const snapshots = await db.query.performanceSnapshots.findMany({
    where: whereClause,
    orderBy: [desc(performanceSnapshots.snapshotDate)],
    limit,
    with: {
      article: {
        columns: {
          id: true,
          title: true,
          slug: true,
          publishedUrl: true
        }
      }
    }
  })

  // Calculate aggregated metrics
  const aggregates = await db
    .select({
      totalClicks: sql<number>`COALESCE(SUM(${performanceSnapshots.clicks}), 0)`,
      totalImpressions: sql<number>`COALESCE(SUM(${performanceSnapshots.impressions}), 0)`,
      avgCtr: sql<number>`COALESCE(AVG(${performanceSnapshots.ctr}), 0)`,
      avgPosition: sql<number>`COALESCE(AVG(${performanceSnapshots.position}), 0)`
    })
    .from(performanceSnapshots)
    .where(whereClause)

  return NextResponse.json({
    snapshots,
    aggregates: aggregates[0] || {
      totalClicks: 0,
      totalImpressions: 0,
      avgCtr: 0,
      avgPosition: 0
    }
  })
})
