import type { GeneratedArticle } from '@/lib/ai/types'
import type { QualityGateResult, QualityCheck } from '@/lib/db/schema'
import { db, tenants } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { PLAN_LIMITS } from '@/lib/billing/plans'

export async function runQualityGates(
  article: GeneratedArticle,
  tenantId: string
): Promise<QualityGateResult> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId)
  })

  const threshold = tenant?.planTier
    ? PLAN_LIMITS[tenant.planTier].qualityThreshold
    : 70

  const checks: QualityCheck[] = []

  // Word count check
  checks.push(checkWordCount(article))

  // Meta title check
  checks.push(checkMetaTitle(article))

  // Meta description check
  checks.push(checkMetaDescription(article))

  // Content structure check
  checks.push(checkContentStructure(article))

  // Readability check
  checks.push(checkReadability(article))

  // AI detection check (placeholder)
  checks.push(checkHumanization(article))

  // Calculate overall score
  const totalWeight = checks.length
  const weightedScore = checks.reduce((sum, check) => sum + check.score, 0)
  const score = Math.round(weightedScore / totalWeight)

  // Determine action based on score and threshold
  let action: 'publish' | 'review' | 'revise'
  if (score >= threshold) {
    action = 'publish'
  } else if (score >= threshold - 15) {
    action = 'review'
  } else {
    action = 'revise'
  }

  return {
    score,
    action,
    checks
  }
}

function checkWordCount(article: GeneratedArticle): QualityCheck {
  const { wordCount } = article
  let score: number
  let message: string

  if (wordCount >= 1200 && wordCount <= 3000) {
    score = 100
    message = `Word count (${wordCount}) is optimal`
  } else if (wordCount >= 800 && wordCount < 1200) {
    score = 75
    message = `Word count (${wordCount}) is slightly below optimal`
  } else if (wordCount > 3000 && wordCount <= 4000) {
    score = 80
    message = `Word count (${wordCount}) is slightly above optimal`
  } else if (wordCount < 800) {
    score = 40
    message = `Word count (${wordCount}) is too low`
  } else {
    score = 60
    message = `Word count (${wordCount}) is too high`
  }

  return {
    name: 'Word Count',
    passed: score >= 70,
    score,
    message
  }
}

function checkMetaTitle(article: GeneratedArticle): QualityCheck {
  const { metaTitle } = article
  let score: number
  let message: string

  if (!metaTitle || metaTitle.length === 0) {
    score = 0
    message = 'Meta title is missing'
  } else if (metaTitle.length >= 40 && metaTitle.length <= 60) {
    score = 100
    message = 'Meta title length is optimal'
  } else if (metaTitle.length >= 30 && metaTitle.length < 40) {
    score = 80
    message = 'Meta title is slightly short'
  } else if (metaTitle.length > 60 && metaTitle.length <= 70) {
    score = 80
    message = 'Meta title is slightly long'
  } else {
    score = 50
    message = 'Meta title length needs improvement'
  }

  return {
    name: 'Meta Title',
    passed: score >= 70,
    score,
    message
  }
}

function checkMetaDescription(article: GeneratedArticle): QualityCheck {
  const { metaDescription } = article
  let score: number
  let message: string

  if (!metaDescription || metaDescription.length === 0) {
    score = 0
    message = 'Meta description is missing'
  } else if (metaDescription.length >= 120 && metaDescription.length <= 155) {
    score = 100
    message = 'Meta description length is optimal'
  } else if (metaDescription.length >= 100 && metaDescription.length < 120) {
    score = 80
    message = 'Meta description is slightly short'
  } else if (metaDescription.length > 155 && metaDescription.length <= 170) {
    score = 80
    message = 'Meta description is slightly long'
  } else {
    score = 50
    message = 'Meta description length needs improvement'
  }

  return {
    name: 'Meta Description',
    passed: score >= 70,
    score,
    message
  }
}

function checkContentStructure(article: GeneratedArticle): QualityCheck {
  const { content } = article

  // Count headings
  const h2Count = (content.match(/^## /gm) || []).length
  const h3Count = (content.match(/^### /gm) || []).length

  // Count paragraphs (rough estimate)
  const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0).length

  let score: number
  let message: string

  if (h2Count >= 3 && h2Count <= 8 && h3Count >= 2 && paragraphs >= 10) {
    score = 100
    message = 'Content structure is well-organized'
  } else if (h2Count >= 2 && paragraphs >= 8) {
    score = 80
    message = 'Content structure is acceptable'
  } else if (h2Count >= 1) {
    score = 60
    message = 'Content needs more structure'
  } else {
    score = 40
    message = 'Content lacks proper structure'
  }

  return {
    name: 'Content Structure',
    passed: score >= 70,
    score,
    message
  }
}

function checkReadability(article: GeneratedArticle): QualityCheck {
  const { content } = article

  // Simple readability heuristics
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = content.split(/\s+/).filter(w => w.length > 0)

  const avgSentenceLength = words.length / sentences.length
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length

  let score: number
  let message: string

  // Optimal: 15-20 words per sentence, 4-6 chars per word
  if (avgSentenceLength >= 12 && avgSentenceLength <= 22 && avgWordLength >= 4 && avgWordLength <= 6) {
    score = 100
    message = 'Readability is excellent'
  } else if (avgSentenceLength >= 10 && avgSentenceLength <= 25) {
    score = 80
    message = 'Readability is good'
  } else if (avgSentenceLength > 25) {
    score = 60
    message = 'Sentences may be too long'
  } else {
    score = 70
    message = 'Readability is acceptable'
  }

  return {
    name: 'Readability',
    passed: score >= 70,
    score,
    message
  }
}

function checkHumanization(article: GeneratedArticle): QualityCheck {
  const { content } = article

  // Check for common AI-generated phrases to avoid
  const aiPhrases = [
    'dive into',
    'delve into',
    'in today\'s world',
    'in this article',
    'let\'s explore',
    'it\'s important to note',
    'at the end of the day',
    'game-changer',
    'cutting-edge',
    'leverage',
    'synergy'
  ]

  const foundPhrases = aiPhrases.filter(phrase =>
    content.toLowerCase().includes(phrase.toLowerCase())
  )

  let score: number
  let message: string

  if (foundPhrases.length === 0) {
    score = 100
    message = 'Content appears natural and human-written'
  } else if (foundPhrases.length <= 2) {
    score = 80
    message = `Found ${foundPhrases.length} common AI phrases`
  } else if (foundPhrases.length <= 4) {
    score = 60
    message = `Found ${foundPhrases.length} common AI phrases - consider revising`
  } else {
    score = 40
    message = `Found ${foundPhrases.length} common AI phrases - needs humanization`
  }

  return {
    name: 'Humanization',
    passed: score >= 70,
    score,
    message
  }
}
