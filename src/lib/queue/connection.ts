import { Redis } from 'ioredis'

const getRedisConfig = () => {
  const url = process.env.REDIS_URL
  if (!url) {
    throw new Error('REDIS_URL environment variable is required')
  }
  return url
}

// Create Redis connection for BullMQ
export const redis = new Redis(getRedisConfig(), {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
})

// Handle connection events
redis.on('error', (err) => {
  console.error('Redis connection error:', err)
})

redis.on('connect', () => {
  console.log('Redis connected')
})

// Create a separate connection for subscribers (BullMQ requirement)
export const createRedisConnection = () => {
  return new Redis(getRedisConfig(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  })
}
