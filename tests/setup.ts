import { beforeAll, afterAll, afterEach, vi } from 'vitest'

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/verba_test'
process.env.REDIS_URL = 'redis://localhost:6379'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
process.env.OPENAI_API_KEY = 'test-openai-key'
process.env.CLERK_SECRET_KEY = 'test-clerk-secret'
process.env.STRIPE_SECRET_KEY = 'test-stripe-secret'

// Global test setup
beforeAll(() => {
  // Setup code that runs before all tests
})

afterAll(() => {
  // Cleanup code that runs after all tests
})

afterEach(() => {
  // Reset mocks after each test
  vi.clearAllMocks()
})

// Mock fetch globally
global.fetch = vi.fn()
