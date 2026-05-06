import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn()
  }
}))

// Mock Redis
vi.mock('@/lib/queue/connection', () => ({
  redis: {
    ping: vi.fn()
  }
}))

describe('Health API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/health', () => {
    it('should return healthy status when all services are up', async () => {
      const { db } = await import('@/lib/db')
      const { redis } = await import('@/lib/queue/connection')

      vi.mocked(db.execute).mockResolvedValue([{ result: 1 }] as never)
      vi.mocked(redis.ping).mockResolvedValue('PONG')

      const { GET } = await import('@/app/api/health/route')
      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe('healthy')
      expect(data.services.database).toBe('connected')
      expect(data.services.redis).toBe('connected')
    })

    it('should return unhealthy status when database is down', async () => {
      const { db } = await import('@/lib/db')
      const { redis } = await import('@/lib/queue/connection')

      vi.mocked(db.execute).mockRejectedValue(new Error('Connection failed'))
      vi.mocked(redis.ping).mockResolvedValue('PONG')

      const { GET } = await import('@/app/api/health/route')
      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe('unhealthy')
      expect(data.services.database).toBe('disconnected')
    })

    it('should return unhealthy status when redis is down', async () => {
      const { db } = await import('@/lib/db')
      const { redis } = await import('@/lib/queue/connection')

      vi.mocked(db.execute).mockResolvedValue([{ result: 1 }] as never)
      vi.mocked(redis.ping).mockRejectedValue(new Error('Connection failed'))

      const { GET } = await import('@/app/api/health/route')
      const request = new NextRequest('http://localhost:3000/api/health')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe('unhealthy')
      expect(data.services.redis).toBe('disconnected')
    })
  })
})
