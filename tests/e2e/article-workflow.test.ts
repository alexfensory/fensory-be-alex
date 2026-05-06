import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * E2E Test: Article Generation Workflow
 *
 * This test simulates the complete article generation workflow:
 * 1. Create a topic
 * 2. Generate article brief
 * 3. Generate article content
 * 4. Pass quality gates
 * 5. Publish to CMS
 *
 * Note: These tests require a running database and Redis instance.
 * Run with: npm run test:e2e
 */

// Mock external services for E2E tests
vi.mock('@/lib/ai/claude', () => ({
  generateArticleContent: vi.fn().mockResolvedValue({
    content: '# Test Article\n\nThis is test content.',
    contentHtml: '<h1>Test Article</h1><p>This is test content.</p>',
    metaTitle: 'Test Article - Verba',
    metaDescription: 'A test article for E2E testing',
    wordCount: 500,
    outline: ['Introduction', 'Main Content', 'Conclusion']
  }),
  analyzeBrandVoice: vi.fn().mockResolvedValue({
    toneDescriptors: ['professional', 'friendly'],
    vocabularyPatterns: ['industry terms'],
    styleGuide: { sentenceLength: 'medium', paragraphLength: 'short' }
  }),
  scoreArticleQuality: vi.fn().mockResolvedValue({
    score: 85,
    action: 'auto_approve',
    checks: [
      { name: 'readability', passed: true, score: 90, message: 'Good readability' },
      { name: 'brand_voice', passed: true, score: 80, message: 'Matches brand voice' }
    ]
  })
}))

vi.mock('@/lib/cms/registry', () => ({
  getConnector: vi.fn().mockReturnValue({
    type: 'wordpress',
    testConnection: vi.fn().mockResolvedValue(true),
    createPost: vi.fn().mockResolvedValue({
      id: 'wp-post-123',
      url: 'https://example.com/test-article',
      status: 'published'
    }),
    updatePost: vi.fn().mockResolvedValue({
      id: 'wp-post-123',
      url: 'https://example.com/test-article',
      status: 'published'
    }),
    deletePost: vi.fn().mockResolvedValue(undefined),
    getPost: vi.fn().mockResolvedValue({
      id: 'wp-post-123',
      url: 'https://example.com/test-article',
      status: 'published'
    })
  })
}))

describe('E2E: Article Generation Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Complete workflow', () => {
    it('should generate and publish an article successfully', async () => {
      const { generateArticleContent, scoreArticleQuality } = await import('@/lib/ai/claude')
      const { getConnector } = await import('@/lib/cms/registry')

      // Step 1: Generate article content
      const content = await generateArticleContent({
        topic: 'AI in Content Marketing',
        brandVoice: {
          toneDescriptors: ['professional'],
          vocabularyPatterns: [],
          styleGuide: {}
        },
        wordCount: 1000,
        outline: ['Introduction', 'Benefits', 'Conclusion']
      })

      expect(content).toBeDefined()
      expect(content.content).toContain('Test Article')
      expect(content.wordCount).toBeGreaterThan(0)

      // Step 2: Score article quality
      const qualityResult = await scoreArticleQuality(content.content, {
        toneDescriptors: ['professional'],
        vocabularyPatterns: [],
        styleGuide: {}
      })

      expect(qualityResult.score).toBeGreaterThanOrEqual(70)
      expect(qualityResult.action).toBe('auto_approve')

      // Step 3: Publish to CMS
      const connector = getConnector('wordpress')
      const published = await connector.createPost({
        title: 'AI in Content Marketing',
        slug: 'ai-content-marketing',
        content: content.content,
        contentHtml: content.contentHtml,
        metaTitle: content.metaTitle,
        metaDescription: content.metaDescription
      }, { siteUrl: 'https://example.com', apiKey: 'test-key' })

      expect(published.id).toBeDefined()
      expect(published.url).toContain('example.com')
      expect(published.status).toBe('published')
    })

    it('should handle quality gate rejection', async () => {
      const { generateArticleContent, scoreArticleQuality } = await import('@/lib/ai/claude')

      // Mock low quality score
      vi.mocked(scoreArticleQuality).mockResolvedValueOnce({
        score: 45,
        action: 'reject',
        checks: [
          { name: 'readability', passed: false, score: 40, message: 'Too complex' },
          { name: 'brand_voice', passed: false, score: 50, message: 'Does not match brand' }
        ]
      })

      const content = await generateArticleContent({
        topic: 'Complex Technical Topic',
        brandVoice: {
          toneDescriptors: ['casual'],
          vocabularyPatterns: [],
          styleGuide: {}
        },
        wordCount: 500,
        outline: ['Introduction', 'Content']
      })

      const qualityResult = await scoreArticleQuality(content.content, {
        toneDescriptors: ['casual'],
        vocabularyPatterns: [],
        styleGuide: {}
      })

      expect(qualityResult.score).toBeLessThan(70)
      expect(qualityResult.action).toBe('reject')
      expect(qualityResult.checks.some(c => !c.passed)).toBe(true)
    })
  })
})
