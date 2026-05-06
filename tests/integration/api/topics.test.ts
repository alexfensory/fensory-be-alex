import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn()
}))

// Mock tenant context
vi.mock('@/lib/auth/clerk', () => ({
  getTenantContext: vi.fn()
}))

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      topics: {
        findMany: vi.fn()
      }
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn()
      })
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn()
      })
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn()
    })
  },
  topics: {},
  eq: vi.fn(),
  and: vi.fn()
}))

describe('Topics API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/topics', () => {
    it('should return 401 when not authenticated', async () => {
      const { getTenantContext } = await import('@/lib/auth/clerk')
      vi.mocked(getTenantContext).mockResolvedValue(null)

      const { GET } = await import('@/app/api/topics/route')
      const request = new NextRequest('http://localhost:3000/api/topics')
      const response = await GET(request)

      expect(response.status).toBe(401)
    })

    it('should return topics for authenticated tenant', async () => {
      const { getTenantContext } = await import('@/lib/auth/clerk')
      const { db } = await import('@/lib/db')

      vi.mocked(getTenantContext).mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'admin'
      })

      const mockTopics = [
        { id: '1', tenantId: 'tenant-1', keyword: 'AI content', status: 'active' },
        { id: '2', tenantId: 'tenant-1', keyword: 'SEO tips', status: 'active' }
      ]

      vi.mocked(db.query.topics.findMany).mockResolvedValue(mockTopics as never)

      const { GET } = await import('@/app/api/topics/route')
      const request = new NextRequest('http://localhost:3000/api/topics')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.topics).toHaveLength(2)
      expect(data.topics[0].keyword).toBe('AI content')
    })
  })

  describe('POST /api/topics', () => {
    it('should create a new topic', async () => {
      const { getTenantContext } = await import('@/lib/auth/clerk')
      const { db } = await import('@/lib/db')

      vi.mocked(getTenantContext).mockResolvedValue({
        tenantId: 'tenant-1',
        userId: 'user-1',
        role: 'admin'
      })

      const newTopic = {
        id: '3',
        tenantId: 'tenant-1',
        keyword: 'New topic',
        status: 'active',
        createdAt: new Date()
      }

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newTopic])
        })
      } as never)

      const { POST } = await import('@/app/api/topics/route')
      const request = new NextRequest('http://localhost:3000/api/topics', {
        method: 'POST',
        body: JSON.stringify({ keyword: 'New topic' })
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.topic.keyword).toBe('New topic')
    })
  })
})
