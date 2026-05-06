import OpenAI from 'openai'
import { db, brandCorpus } from '@/lib/db'
import { eq, sql, and, cosineDistance, desc } from 'drizzle-orm'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function generateEmbeddings(text: string): Promise<number[]> {
  // Truncate text to stay within token limits
  const truncatedText = text.slice(0, 8000)

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncatedText
  })

  return response.data[0].embedding
}

export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  // Truncate each text and batch embed
  const truncatedTexts = texts.map(t => t.slice(0, 8000))

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: truncatedTexts
  })

  return response.data.map(d => d.embedding)
}

export interface SimilarContent {
  id: string
  title: string | null
  content: string
  sourceUrl: string | null
  similarity: number
}

export async function searchSimilarContent(
  tenantId: string,
  query: string,
  limit: number = 5
): Promise<SimilarContent[]> {
  const queryEmbedding = await generateEmbeddings(query)

  // Use pgvector's cosine distance for similarity search
  const results = await db
    .select({
      id: brandCorpus.id,
      title: brandCorpus.title,
      content: brandCorpus.content,
      sourceUrl: brandCorpus.sourceUrl,
      similarity: sql<number>`1 - (${brandCorpus.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector)`
    })
    .from(brandCorpus)
    .where(eq(brandCorpus.tenantId, tenantId))
    .orderBy(sql`${brandCorpus.embedding} <=> ${JSON.stringify(queryEmbedding)}::vector`)
    .limit(limit)

  return results.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    sourceUrl: r.sourceUrl,
    similarity: r.similarity
  }))
}

export async function findRelatedTopics(
  tenantId: string,
  content: string,
  limit: number = 10
): Promise<string[]> {
  const similar = await searchSimilarContent(tenantId, content, limit)

  // Extract unique topics/keywords from similar content
  const keywords = new Set<string>()

  for (const item of similar) {
    // Simple keyword extraction - in production, use NLP
    const words = item.content
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 4)

    words.slice(0, 20).forEach(w => keywords.add(w))
  }

  return Array.from(keywords).slice(0, 20)
}
