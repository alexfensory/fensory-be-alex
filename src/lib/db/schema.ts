import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  real,
  jsonb,
  vector,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import {
  planTierEnum,
  userRoleEnum,
  articleStatusEnum,
  topicStatusEnum,
  topicLaneEnum,
  corpusSourceEnum,
  cmsConnectorEnum,
  channelTypeEnum,
  conversationStateEnum,
  briefStatusEnum,
  indexingStatusEnum
} from './enums'

// =============================================================================
// TENANTS
// =============================================================================
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: varchar('clerk_org_id', { length: 255 }).unique(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  planTier: planTierEnum('plan_tier').default('solo'),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  postsUsedThisMonth: integer('posts_used_this_month').default(0),
  billingCycleStart: timestamp('billing_cycle_start'),
  onboardingStep: integer('onboarding_step').default(0),
  onboardingComplete: boolean('onboarding_complete').default(false),
  websiteUrl: text('website_url'),
  logoUrl: text('logo_url'),
  settings: jsonb('settings').$type<TenantSettings>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('tenants_clerk_org_idx').on(table.clerkOrgId),
  index('tenants_stripe_customer_idx').on(table.stripeCustomerId)
])

export type TenantSettings = {
  timezone?: string
  defaultCmsConnectionId?: string
  autoPublish?: boolean
  qualityThreshold?: number
}

// =============================================================================
// USERS
// =============================================================================
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: varchar('clerk_user_id', { length: 255 }).unique().notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }),
  role: userRoleEnum('role').default('editor'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('users_clerk_user_idx').on(table.clerkUserId),
  index('users_tenant_idx').on(table.tenantId)
])

// =============================================================================
// BRAND CORPUS (RAG content)
// =============================================================================
export const brandCorpus = pgTable('brand_corpus', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  sourceType: corpusSourceEnum('source_type').notNull(),
  sourceUrl: text('source_url'),
  title: varchar('title', { length: 500 }),
  content: text('content').notNull(),
  embedding: vector('embedding', { dimensions: 1536 }),
  metadata: jsonb('metadata').$type<CorpusMetadata>(),
  crawledAt: timestamp('crawled_at'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('brand_corpus_tenant_idx').on(table.tenantId)
])

export type CorpusMetadata = {
  wordCount?: number
  language?: string
  contentType?: string
}

// =============================================================================
// BRAND VOICE PROFILES
// =============================================================================
export const brandVoiceProfiles = pgTable('brand_voice_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).unique().notNull(),
  toneDescriptors: jsonb('tone_descriptors').$type<string[]>(),
  vocabulary: jsonb('vocabulary').$type<VocabularySettings>(),
  vocabularyPatterns: jsonb('vocabulary_patterns').$type<Record<string, string[]>>(),
  styleGuidelines: jsonb('style_guidelines').$type<StyleGuideline[]>(),
  exampleSnippets: jsonb('example_snippets').$type<string[]>(),
  doNotUse: jsonb('do_not_use').$type<string[]>(),
  voiceSummary: text('voice_summary'),
  targetAudience: text('target_audience'),
  industryContext: text('industry_context'),
  generatedAt: timestamp('generated_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
})

export type VocabularySettings = {
  preferredTerms?: string[]
  avoidTerms?: string[]
  jargonLevel?: 'none' | 'light' | 'moderate' | 'heavy'
}

export type StyleGuideline = {
  category: string
  guideline: string
}

// =============================================================================
// TOPICS
// =============================================================================
export const topics = pgTable('topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  lane: topicLaneEnum('lane').default('standard'),
  title: varchar('title', { length: 500 }).notNull(),
  keyword: varchar('keyword', { length: 255 }),
  slug: varchar('slug', { length: 500 }),
  keywords: jsonb('keywords').$type<string[]>(),
  difficulty: integer('difficulty'),
  searchVolume: integer('search_volume'),
  priority: integer('priority').default(50),
  status: topicStatusEnum('status').default('discovered'),
  pillarId: uuid('pillar_id').references((): typeof topics => topics.id),
  scheduledFor: timestamp('scheduled_for'),
  briefTemplate: text('brief_template'),
  metadata: jsonb('metadata').$type<TopicMetadata>(),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('topics_tenant_idx').on(table.tenantId),
  index('topics_status_idx').on(table.status),
  index('topics_pillar_idx').on(table.pillarId)
])

export type TopicMetadata = {
  competitorUrls?: string[]
  searchIntent?: 'informational' | 'transactional' | 'navigational' | 'commercial'
  estimatedReadTime?: number
}

// =============================================================================
// ARTICLES
// =============================================================================
export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 500 }).notNull(),
  slug: varchar('slug', { length: 500 }).notNull(),
  content: text('content'),
  contentHtml: text('content_html'),
  metaTitle: varchar('meta_title', { length: 70 }),
  metaDescription: varchar('meta_description', { length: 160 }),
  featuredImageUrl: text('featured_image_url'),
  status: articleStatusEnum('status').default('draft'),
  qualityScore: integer('quality_score'),
  humanizationScore: integer('humanization_score'),
  wordCount: integer('word_count'),
  targetKeyword: varchar('target_keyword', { length: 255 }),
  vertical: varchar('vertical', { length: 50 }),
  qualityGateResult: jsonb('quality_gate_result').$type<QualityGateResult>(),
  publishedAt: timestamp('published_at'),
  publishedUrl: text('published_url'),
  cmsConnectionId: uuid('cms_connection_id'),
  cmsPostId: varchar('cms_post_id', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => [
  index('articles_tenant_idx').on(table.tenantId),
  index('articles_topic_idx').on(table.topicId),
  index('articles_status_idx').on(table.status),
  uniqueIndex('articles_tenant_slug_idx').on(table.tenantId, table.slug)
])

export type QualityGateResult = {
  score: number
  action: 'publish' | 'review' | 'revise'
  checks: QualityCheck[]
}

export type QualityCheck = {
  name: string
  passed: boolean
  score: number
  message?: string
}

// =============================================================================
// ARTICLE BRIEFS
// =============================================================================
export const articleBriefs = pgTable('article_briefs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
  title: varchar('title', { length: 500 }),
  targetWordCount: integer('target_word_count'),
  outline: jsonb('outline').$type<OutlineSection[]>(),
  seoRecommendations: jsonb('seo_recommendations').$type<SeoRecommendation[]>(),
  brandContext: text('brand_context'),
  status: briefStatusEnum('status').default('draft'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('article_briefs_tenant_idx').on(table.tenantId),
  index('article_briefs_topic_idx').on(table.topicId)
])

export type OutlineSection = {
  heading: string
  level: number
  keyPoints?: string[]
  estimatedWords?: number
}

export type SeoRecommendation = {
  type: 'keyword' | 'structure' | 'meta' | 'link'
  recommendation: string
  priority: 'high' | 'medium' | 'low'
}

// =============================================================================
// CMS CONNECTIONS
// =============================================================================
export const cmsConnections = pgTable('cms_connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  connectorType: cmsConnectorEnum('connector_type').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  isActive: boolean('is_active').default(true),
  isDefault: boolean('is_default').default(false),
  credentials: jsonb('credentials').$type<CMSCredentials>(), // encrypted
  settings: jsonb('settings').$type<CMSSettings>(),
  lastSyncAt: timestamp('last_sync_at'),
  lastError: text('last_error'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('cms_connections_tenant_idx').on(table.tenantId)
])

export type CMSCredentials = {
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  siteUrl?: string
  username?: string
  password?: string
  expiresAt?: string
  collectionId?: string
}

export type CMSSettings = {
  autoPublish?: boolean
  defaultCategory?: string
  defaultAuthor?: string
  customFields?: Record<string, string>
}

// =============================================================================
// AGENT CHANNELS
// =============================================================================
export const agentChannels = pgTable('agent_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  channelType: channelTypeEnum('channel_type').notNull(),
  isActive: boolean('is_active').default(false),
  config: jsonb('config').$type<ChannelConfig>(), // encrypted
  webhookSecret: varchar('webhook_secret', { length: 255 }),
  lastMessageAt: timestamp('last_message_at'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('agent_channels_tenant_idx').on(table.tenantId),
  index('agent_channels_type_idx').on(table.channelType)
])

export type ChannelConfig = {
  botToken?: string
  chatId?: string
  channelId?: string
  webhookUrl?: string
  email?: string
}

// =============================================================================
// AGENT CONVERSATIONS
// =============================================================================
export const agentConversations = pgTable('agent_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  channelId: uuid('channel_id').references(() => agentChannels.id, { onDelete: 'cascade' }),
  channelUserId: varchar('channel_user_id', { length: 255 }),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
  state: conversationStateEnum('state').default('idle'),
  messages: jsonb('messages').$type<ConversationMessage[]>(),
  lastActivityAt: timestamp('last_activity_at'),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('agent_conversations_tenant_idx').on(table.tenantId),
  index('agent_conversations_channel_idx').on(table.channelId),
  index('agent_conversations_article_idx').on(table.articleId)
])

export type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}

// =============================================================================
// PERFORMANCE SNAPSHOTS (GSC data)
// =============================================================================
export const performanceSnapshots = pgTable('performance_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  date: timestamp('date').notNull(),
  snapshotDate: date('snapshot_date').notNull(),
  clicks: integer('clicks'),
  impressions: integer('impressions'),
  ctr: real('ctr'),
  position: real('position'),
  topQueries: jsonb('top_queries').$type<QueryData[]>(),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('performance_snapshots_tenant_idx').on(table.tenantId),
  index('performance_snapshots_article_idx').on(table.articleId),
  index('performance_snapshots_date_idx').on(table.snapshotDate),
  index('performance_snapshots_date_ts_idx').on(table.date)
])

export type QueryData = {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

// =============================================================================
// INDEXING CHECKS
// =============================================================================
export const indexingChecks = pgTable('indexing_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  checkDay: integer('check_day').notNull(), // 1, 3, 7, 14
  status: indexingStatusEnum('status').default('pending'),
  isIndexed: boolean('is_indexed'),
  checkedAt: timestamp('checked_at'),
  result: jsonb('result').$type<IndexingResult>(),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('indexing_checks_tenant_idx').on(table.tenantId),
  index('indexing_checks_article_idx').on(table.articleId),
  index('indexing_checks_status_idx').on(table.status)
])

export type IndexingResult = {
  isIndexed: boolean
  lastCrawled?: string
  verdict?: string
  issues?: string[]
}

// =============================================================================
// ACTIVITY LOG
// =============================================================================
export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at').defaultNow()
}, (table) => [
  index('activity_log_tenant_idx').on(table.tenantId),
  index('activity_log_user_idx').on(table.userId),
  index('activity_log_action_idx').on(table.action),
  index('activity_log_created_idx').on(table.createdAt)
])

// =============================================================================
// RELATIONS
// =============================================================================
export const tenantsRelations = relations(tenants, ({ many, one }) => ({
  users: many(users),
  brandCorpus: many(brandCorpus),
  brandVoiceProfile: one(brandVoiceProfiles),
  topics: many(topics),
  articles: many(articles),
  articleBriefs: many(articleBriefs),
  cmsConnections: many(cmsConnections),
  agentChannels: many(agentChannels),
  agentConversations: many(agentConversations),
  performanceSnapshots: many(performanceSnapshots),
  indexingChecks: many(indexingChecks),
  activityLog: many(activityLog)
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id]
  }),
  activityLog: many(activityLog)
}))

export const brandCorpusRelations = relations(brandCorpus, ({ one }) => ({
  tenant: one(tenants, {
    fields: [brandCorpus.tenantId],
    references: [tenants.id]
  })
}))

export const brandVoiceProfilesRelations = relations(brandVoiceProfiles, ({ one }) => ({
  tenant: one(tenants, {
    fields: [brandVoiceProfiles.tenantId],
    references: [tenants.id]
  })
}))

export const topicsRelations = relations(topics, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [topics.tenantId],
    references: [tenants.id]
  }),
  pillar: one(topics, {
    fields: [topics.pillarId],
    references: [topics.id],
    relationName: 'pillarClusters'
  }),
  clusters: many(topics, { relationName: 'pillarClusters' }),
  articles: many(articles),
  briefs: many(articleBriefs)
}))

export const articlesRelations = relations(articles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [articles.tenantId],
    references: [tenants.id]
  }),
  topic: one(topics, {
    fields: [articles.topicId],
    references: [topics.id]
  }),
  brief: one(articleBriefs),
  performanceSnapshots: many(performanceSnapshots),
  indexingChecks: many(indexingChecks),
  conversations: many(agentConversations)
}))

export const articleBriefsRelations = relations(articleBriefs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [articleBriefs.tenantId],
    references: [tenants.id]
  }),
  topic: one(topics, {
    fields: [articleBriefs.topicId],
    references: [topics.id]
  }),
  article: one(articles, {
    fields: [articleBriefs.articleId],
    references: [articles.id]
  })
}))

export const cmsConnectionsRelations = relations(cmsConnections, ({ one }) => ({
  tenant: one(tenants, {
    fields: [cmsConnections.tenantId],
    references: [tenants.id]
  })
}))

export const agentChannelsRelations = relations(agentChannels, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [agentChannels.tenantId],
    references: [tenants.id]
  }),
  conversations: many(agentConversations)
}))

export const agentConversationsRelations = relations(agentConversations, ({ one }) => ({
  tenant: one(tenants, {
    fields: [agentConversations.tenantId],
    references: [tenants.id]
  }),
  channel: one(agentChannels, {
    fields: [agentConversations.channelId],
    references: [agentChannels.id]
  }),
  article: one(articles, {
    fields: [agentConversations.articleId],
    references: [articles.id]
  })
}))

export const performanceSnapshotsRelations = relations(performanceSnapshots, ({ one }) => ({
  tenant: one(tenants, {
    fields: [performanceSnapshots.tenantId],
    references: [tenants.id]
  }),
  article: one(articles, {
    fields: [performanceSnapshots.articleId],
    references: [articles.id]
  })
}))

export const indexingChecksRelations = relations(indexingChecks, ({ one }) => ({
  tenant: one(tenants, {
    fields: [indexingChecks.tenantId],
    references: [tenants.id]
  }),
  article: one(articles, {
    fields: [indexingChecks.articleId],
    references: [articles.id]
  })
}))

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  tenant: one(tenants, {
    fields: [activityLog.tenantId],
    references: [tenants.id]
  }),
  user: one(users, {
    fields: [activityLog.userId],
    references: [users.id]
  })
}))
