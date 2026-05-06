import Anthropic from '@anthropic-ai/sdk'
import type { BrandVoice, GeneratedArticle, ArticleBrief, AgentIntentResult } from './types'
import { ARTICLE_SYSTEM_PROMPT, VOICE_ANALYSIS_PROMPT, AGENT_NLP_PROMPT } from './prompts'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function generateArticleContent(
  brief: ArticleBrief,
  brandVoice: BrandVoice,
  context: string[]
): Promise<GeneratedArticle> {
  const systemPrompt = buildArticleSystemPrompt(brandVoice)
  const userPrompt = buildArticleUserPrompt(brief, context)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return parseArticleResponse(content.text)
}

export async function analyzeBrandVoice(
  corpusContent: string[]
): Promise<BrandVoice> {
  const sampleContent = corpusContent
    .slice(0, 10)
    .map(c => c.slice(0, 2000))
    .join('\n\n---\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: VOICE_ANALYSIS_PROMPT,
    messages: [{
      role: 'user',
      content: `Analyze the following content samples and extract the brand voice:\n\n${sampleContent}`
    }]
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return parseVoiceResponse(content.text)
}

export async function parseAgentIntent(
  message: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AgentIntentResult> {
  const messages = [
    ...conversationHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    })),
    { role: 'user' as const, content: message }
  ]

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: AGENT_NLP_PROMPT,
    messages
  })

  const content = response.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  return parseIntentResponse(content.text)
}

function buildArticleSystemPrompt(brandVoice: BrandVoice): string {
  return `${ARTICLE_SYSTEM_PROMPT}

## Brand Voice Guidelines

### Tone
${brandVoice.toneDescriptors?.join(', ') || 'Professional and informative'}

### Target Audience
${brandVoice.targetAudience || 'General audience'}

### Industry Context
${brandVoice.industryContext || 'Not specified'}

### Style Guidelines
${brandVoice.styleGuidelines?.map(g => `- ${g.category}: ${g.guideline}`).join('\n') || 'No specific guidelines'}

### Vocabulary Preferences
- Preferred terms: ${brandVoice.vocabulary?.preferredTerms?.join(', ') || 'None specified'}
- Avoid: ${brandVoice.vocabulary?.avoidTerms?.join(', ') || 'None specified'}
- Jargon level: ${brandVoice.vocabulary?.jargonLevel || 'moderate'}

### Do NOT Use
${brandVoice.doNotUse?.join('\n') || 'No restrictions'}
`
}

function buildArticleUserPrompt(brief: ArticleBrief, context: string[]): string {
  const outlineText = brief.outline
    ?.map(s => `${'#'.repeat(s.level + 1)} ${s.heading}${s.keyPoints?.length ? '\n' + s.keyPoints.map(p => `- ${p}`).join('\n') : ''}`)
    .join('\n\n') || ''

  return `Write an article with the following specifications:

## Title
${brief.title}

## Target Word Count
${brief.targetWordCount || 1500} words

## Outline
${outlineText || 'Create an appropriate outline for the topic'}

## SEO Recommendations
${brief.seoRecommendations?.map(r => `- [${r.priority}] ${r.recommendation}`).join('\n') || 'Optimize for the main keyword in the title'}

## Brand Context
${brief.brandContext || 'No additional context'}

## Reference Material
${context.length > 0 ? context.map((c, i) => `### Source ${i + 1}\n${c.slice(0, 1500)}`).join('\n\n') : 'No reference material provided'}

Please write the article in markdown format. Include:
1. An engaging introduction
2. Well-structured body sections following the outline
3. A compelling conclusion
4. Meta title (max 60 characters)
5. Meta description (max 155 characters)

Format your response as follows:
---META_TITLE---
[Your meta title here]
---META_DESCRIPTION---
[Your meta description here]
---CONTENT---
[Your article content in markdown]
`
}

function parseArticleResponse(text: string): GeneratedArticle {
  const metaTitleMatch = text.match(/---META_TITLE---\s*([\s\S]*?)\s*---META_DESCRIPTION---/)
  const metaDescMatch = text.match(/---META_DESCRIPTION---\s*([\s\S]*?)\s*---CONTENT---/)
  const contentMatch = text.match(/---CONTENT---\s*([\s\S]*)/)

  const content = contentMatch?.[1]?.trim() || text
  const wordCount = content.split(/\s+/).length

  // Convert markdown to HTML (basic conversion)
  const contentHtml = convertMarkdownToHtml(content)

  return {
    content,
    contentHtml,
    metaTitle: metaTitleMatch?.[1]?.trim().slice(0, 60) || '',
    metaDescription: metaDescMatch?.[1]?.trim().slice(0, 155) || '',
    wordCount
  }
}

function parseVoiceResponse(text: string): BrandVoice {
  try {
    // Try to parse as JSON first
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }

    // Otherwise try to parse the whole text as JSON
    return JSON.parse(text)
  } catch {
    // Fallback: extract what we can from the text
    return {
      toneDescriptors: extractList(text, 'tone'),
      vocabulary: {
        preferredTerms: extractList(text, 'preferred'),
        avoidTerms: extractList(text, 'avoid'),
        jargonLevel: 'moderate'
      },
      styleGuidelines: [],
      exampleSnippets: [],
      doNotUse: extractList(text, 'do not'),
      targetAudience: extractSection(text, 'audience'),
      industryContext: extractSection(text, 'industry')
    }
  }
}

function parseIntentResponse(text: string): AgentIntentResult {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
    return JSON.parse(text)
  } catch {
    // Try to extract intent from text
    const textLower = text.toLowerCase()

    if (textLower.includes('approve')) {
      return { intent: 'approve', confidence: 0.8 }
    }
    if (textLower.includes('reject')) {
      return { intent: 'reject', confidence: 0.8 }
    }
    if (textLower.includes('edit')) {
      return { intent: 'edit', confidence: 0.8, parameters: { editInstructions: text } }
    }
    if (textLower.includes('schedule')) {
      return { intent: 'schedule', confidence: 0.8 }
    }
    if (textLower.includes('help')) {
      return { intent: 'help', confidence: 0.9 }
    }

    return { intent: 'unknown', confidence: 0.5 }
  }
}

function extractList(text: string, keyword: string): string[] {
  const regex = new RegExp(`${keyword}[^:]*:[^\\n]*([\\s\\S]*?)(?=\\n\\n|$)`, 'i')
  const match = text.match(regex)
  if (!match) return []

  return match[1]
    .split(/[-•*]\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function extractSection(text: string, keyword: string): string {
  const regex = new RegExp(`${keyword}[^:]*:\\s*([^\\n]+)`, 'i')
  const match = text.match(regex)
  return match?.[1]?.trim() || ''
}

function convertMarkdownToHtml(markdown: string): string {
  // Basic markdown to HTML conversion
  let html = markdown
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // Paragraphs (wrap non-html lines)
    .split('\n\n')
    .map(block => {
      if (block.startsWith('<')) return block
      if (block.includes('<li>')) return `<ul>${block}</ul>`
      return `<p>${block}</p>`
    })
    .join('\n')

  return html
}
