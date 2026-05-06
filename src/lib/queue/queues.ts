import { Queue } from 'bullmq'
import { redis } from './connection'

// Default job options
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000
  },
  removeOnComplete: {
    count: 100,
    age: 24 * 3600 // 24 hours
  },
  removeOnFail: {
    count: 500,
    age: 7 * 24 * 3600 // 7 days
  }
}

// Brand crawling queue
export const brandCrawlQueue = new Queue('brand-crawl', {
  connection: redis,
  defaultJobOptions
})

// Article generation queue
export const articleGenerationQueue = new Queue('article-generation', {
  connection: redis,
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2 // Less retries for expensive AI operations
  }
})

// CMS publishing queue
export const cmsPublishQueue = new Queue('cms-publish', {
  connection: redis,
  defaultJobOptions
})

// Agent dispatch queue
export const agentDispatchQueue = new Queue('agent-dispatch', {
  connection: redis,
  defaultJobOptions
})

// Indexing checks queue
export const indexingQueue = new Queue('indexing', {
  connection: redis,
  defaultJobOptions
})

// Performance sync queue (GSC data)
export const performanceQueue = new Queue('performance', {
  connection: redis,
  defaultJobOptions
})

// Topic discovery queue
export const topicDiscoveryQueue = new Queue('topic-discovery', {
  connection: redis,
  defaultJobOptions
})

// Brief generation queue
export const briefGenerationQueue = new Queue('brief-generation', {
  connection: redis,
  defaultJobOptions
})

// Export all queues for monitoring
export const allQueues = {
  brandCrawl: brandCrawlQueue,
  articleGeneration: articleGenerationQueue,
  cmsPublish: cmsPublishQueue,
  agentDispatch: agentDispatchQueue,
  indexing: indexingQueue,
  performance: performanceQueue,
  topicDiscovery: topicDiscoveryQueue,
  briefGeneration: briefGenerationQueue
}

// Job type definitions
export interface BrandCrawlJobData {
  tenantId: string
  url: string
  depth?: number
  maxPages?: number
}

export interface ArticleGenerationJobData {
  tenantId: string
  topicId: string
  briefId?: string
}

export interface CMSPublishJobData {
  tenantId: string
  articleId: string
  connectionId: string
}

export interface AgentDispatchJobData {
  tenantId: string
  articleId: string
  action: 'review' | 'approve' | 'reject' | 'publish'
  channelType?: string
}

export interface IndexingJobData {
  tenantId: string
  articleId: string
  checkId?: string
  url: string
}

export interface PerformanceJobData {
  tenantId: string
  siteUrl: string
}

export interface TopicDiscoveryJobData {
  tenantId: string
  keywords?: string[]
  mode?: 'standard' | 'newsjacking'
}

export interface BriefGenerationJobData {
  tenantId: string
  topicId: string
}
