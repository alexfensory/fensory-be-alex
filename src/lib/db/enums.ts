import { pgEnum } from 'drizzle-orm/pg-core'

export const planTierEnum = pgEnum('plan_tier', ['solo', 'growth', 'scale'])

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer'])

export const articleStatusEnum = pgEnum('article_status', [
  'draft',
  'generating',
  'pending_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'error',
  'archived'
])

export const topicStatusEnum = pgEnum('topic_status', [
  'discovered',
  'queued',
  'in_progress',
  'completed',
  'skipped'
])

export const topicLaneEnum = pgEnum('topic_lane', [
  'standard',
  'pillar',
  'cluster',
  'newsjacking'
])

export const corpusSourceEnum = pgEnum('corpus_source', [
  'website',
  'document',
  'manual',
  'api'
])

export const cmsConnectorEnum = pgEnum('cms_connector', [
  'wordpress',
  'webflow',
  'ghost',
  'notion',
  'hubspot',
  'custom'
])

export const channelTypeEnum = pgEnum('channel_type', [
  'email',
  'telegram',
  'slack',
  'whatsapp',
  'web'
])

export const conversationStateEnum = pgEnum('conversation_state', [
  'idle',
  'presenting',
  'awaiting_response',
  'processing',
  'complete'
])

export const briefStatusEnum = pgEnum('brief_status', [
  'draft',
  'approved',
  'generating',
  'complete'
])

export const indexingStatusEnum = pgEnum('indexing_status', [
  'pending',
  'checking',
  'complete',
  'failed'
])
