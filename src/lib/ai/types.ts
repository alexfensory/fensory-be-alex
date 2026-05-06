export interface BrandVoice {
  toneDescriptors: string[] | null
  vocabulary: VocabularySettings | null
  styleGuidelines: StyleGuideline[] | null
  exampleSnippets: string[] | null
  doNotUse: string[] | null
  targetAudience: string | null
  industryContext: string | null
}

export interface VocabularySettings {
  preferredTerms?: string[]
  avoidTerms?: string[]
  jargonLevel?: 'none' | 'light' | 'moderate' | 'heavy'
}

export interface StyleGuideline {
  category: string
  guideline: string
}

export interface ArticleBrief {
  title: string
  targetWordCount?: number
  outline?: OutlineSection[]
  seoRecommendations?: SeoRecommendation[]
  brandContext?: string
}

export interface OutlineSection {
  heading: string
  level: number
  keyPoints?: string[]
  estimatedWords?: number
}

export interface SeoRecommendation {
  type: 'keyword' | 'structure' | 'meta' | 'link'
  recommendation: string
  priority: 'high' | 'medium' | 'low'
}

export interface GeneratedArticle {
  content: string
  contentHtml: string
  metaTitle: string
  metaDescription: string
  wordCount: number
  featuredImageUrl?: string
}

export interface AgentIntentResult {
  intent: 'approve' | 'reject' | 'edit' | 'schedule' | 'help' | 'unknown'
  confidence: number
  parameters?: {
    editInstructions?: string
    scheduledFor?: string
  }
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: Record<string, unknown>
}
