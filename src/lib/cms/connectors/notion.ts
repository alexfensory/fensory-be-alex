import type { CMSConnector, CMSCredentials, CMSPost, ArticleForCMS } from '../types'

interface NotionPage {
  id: string
  url: string
  properties: Record<string, unknown>
}

interface NotionBlockChild {
  object: 'block'
  type: string
  [key: string]: unknown
}

export class NotionConnector implements CMSConnector {
  type = 'notion' as const
  private baseUrl = 'https://api.notion.com/v1'
  private notionVersion = '2022-06-28'

  private getHeaders(credentials: CMSCredentials) {
    return {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': this.notionVersion
    }
  }

  getAuthUrl(tenantId: string, redirectUri: string): string {
    const clientId = process.env.NOTION_CLIENT_ID
    if (!clientId) throw new Error('NOTION_CLIENT_ID not configured')

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: redirectUri,
      state: tenantId
    })

    return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  }

  async handleCallback(code: string, _tenantId: string): Promise<CMSCredentials> {
    const clientId = process.env.NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('Notion OAuth credentials not configured')
    }

    const response = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/cms/notion/callback`
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Notion OAuth error: ${error}`)
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      siteId: data.workspace_id
    }
  }

  async testConnection(credentials: CMSCredentials): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/users/me`, {
        headers: this.getHeaders(credentials)
      })
      return response.ok
    } catch {
      return false
    }
  }

  async createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    const databaseId = credentials.collectionId
    if (!databaseId) {
      throw new Error('Notion database ID (collectionId) is required')
    }

    // Create page properties
    const properties: Record<string, unknown> = {
      'Title': {
        title: [{ text: { content: article.title } }]
      },
      'Slug': {
        rich_text: [{ text: { content: article.slug } }]
      },
      'Meta Title': {
        rich_text: [{ text: { content: article.metaTitle } }]
      },
      'Meta Description': {
        rich_text: [{ text: { content: article.metaDescription } }]
      },
      'Status': {
        select: { name: 'Published' }
      }
    }

    if (article.featuredImageUrl) {
      properties['Featured Image'] = {
        url: article.featuredImageUrl
      }
    }

    if (article.tags && article.tags.length > 0) {
      properties['Tags'] = {
        multi_select: article.tags.map(tag => ({ name: tag }))
      }
    }

    // Convert HTML content to Notion blocks
    const children = this.htmlToNotionBlocks(article.contentHtml)

    const response = await fetch(`${this.baseUrl}/pages`, {
      method: 'POST',
      headers: this.getHeaders(credentials),
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties,
        children
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create Notion page: ${error}`)
    }

    const page: NotionPage = await response.json()

    return {
      id: page.id,
      url: page.url,
      status: 'published'
    }
  }

  async updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    // Update page properties
    const properties: Record<string, unknown> = {
      'Title': {
        title: [{ text: { content: article.title } }]
      },
      'Slug': {
        rich_text: [{ text: { content: article.slug } }]
      },
      'Meta Title': {
        rich_text: [{ text: { content: article.metaTitle } }]
      },
      'Meta Description': {
        rich_text: [{ text: { content: article.metaDescription } }]
      }
    }

    if (article.featuredImageUrl) {
      properties['Featured Image'] = {
        url: article.featuredImageUrl
      }
    }

    if (article.tags && article.tags.length > 0) {
      properties['Tags'] = {
        multi_select: article.tags.map(tag => ({ name: tag }))
      }
    }

    const response = await fetch(`${this.baseUrl}/pages/${postId}`, {
      method: 'PATCH',
      headers: this.getHeaders(credentials),
      body: JSON.stringify({ properties })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to update Notion page: ${error}`)
    }

    const page: NotionPage = await response.json()

    // Delete existing blocks and add new content
    await this.replacePageContent(postId, article.contentHtml, credentials)

    return {
      id: page.id,
      url: page.url,
      status: 'published'
    }
  }

  async deletePost(postId: string, credentials: CMSCredentials): Promise<void> {
    const response = await fetch(`${this.baseUrl}/pages/${postId}`, {
      method: 'PATCH',
      headers: this.getHeaders(credentials),
      body: JSON.stringify({ archived: true })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to archive Notion page: ${error}`)
    }
  }

  async getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null> {
    try {
      const response = await fetch(`${this.baseUrl}/pages/${postId}`, {
        headers: this.getHeaders(credentials)
      })

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error('Failed to get Notion page')
      }

      const page: NotionPage = await response.json()

      return {
        id: page.id,
        url: page.url,
        status: 'published'
      }
    } catch {
      return null
    }
  }

  private async replacePageContent(
    pageId: string,
    htmlContent: string,
    credentials: CMSCredentials
  ): Promise<void> {
    // Get existing blocks
    const blocksResponse = await fetch(
      `${this.baseUrl}/blocks/${pageId}/children?page_size=100`,
      { headers: this.getHeaders(credentials) }
    )

    if (blocksResponse.ok) {
      const blocksData = await blocksResponse.json()

      // Delete existing blocks
      for (const block of blocksData.results) {
        await fetch(`${this.baseUrl}/blocks/${block.id}`, {
          method: 'DELETE',
          headers: this.getHeaders(credentials)
        })
      }
    }

    // Add new blocks
    const children = this.htmlToNotionBlocks(htmlContent)

    // Notion has a limit of 100 blocks per request
    const chunks = this.chunkArray(children, 100)

    for (const chunk of chunks) {
      await fetch(`${this.baseUrl}/blocks/${pageId}/children`, {
        method: 'PATCH',
        headers: this.getHeaders(credentials),
        body: JSON.stringify({ children: chunk })
      })
    }
  }

  private htmlToNotionBlocks(html: string): NotionBlockChild[] {
    const blocks: NotionBlockChild[] = []

    // Simple HTML to Notion blocks conversion
    // Split by common block elements
    const lines = html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n###H1###$1###/H1###\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n###H2###$1###/H2###\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n###H3###$1###/H3###\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n###P###$1###/P###\n')
      .replace(/<ul[^>]*>(.*?)<\/ul>/gis, '\n###UL###$1###/UL###\n')
      .replace(/<ol[^>]*>(.*?)<\/ol>/gis, '\n###OL###$1###/OL###\n')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, '\n###BQ###$1###/BQ###\n')
      .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '\n###CODE###$1###/CODE###\n')
      .split('\n')
      .filter(line => line.trim())

    for (const line of lines) {
      const trimmed = line.trim()

      if (trimmed.startsWith('###H1###')) {
        const text = this.stripHtml(trimmed.replace(/###\/?H1###/g, ''))
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{ type: 'text', text: { content: text } }]
          }
        })
      } else if (trimmed.startsWith('###H2###')) {
        const text = this.stripHtml(trimmed.replace(/###\/?H2###/g, ''))
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: text } }]
          }
        })
      } else if (trimmed.startsWith('###H3###')) {
        const text = this.stripHtml(trimmed.replace(/###\/?H3###/g, ''))
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ type: 'text', text: { content: text } }]
          }
        })
      } else if (trimmed.startsWith('###P###')) {
        const text = this.stripHtml(trimmed.replace(/###\/?P###/g, ''))
        if (text) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: text } }]
            }
          })
        }
      } else if (trimmed.startsWith('###UL###')) {
        const content = trimmed.replace(/###\/?UL###/g, '')
        const items = content.match(/<li[^>]*>(.*?)<\/li>/gi) || []
        for (const item of items) {
          const text = this.stripHtml(item.replace(/<\/?li[^>]*>/gi, ''))
          blocks.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{ type: 'text', text: { content: text } }]
            }
          })
        }
      } else if (trimmed.startsWith('###OL###')) {
        const content = trimmed.replace(/###\/?OL###/g, '')
        const items = content.match(/<li[^>]*>(.*?)<\/li>/gi) || []
        for (const item of items) {
          const text = this.stripHtml(item.replace(/<\/?li[^>]*>/gi, ''))
          blocks.push({
            object: 'block',
            type: 'numbered_list_item',
            numbered_list_item: {
              rich_text: [{ type: 'text', text: { content: text } }]
            }
          })
        }
      } else if (trimmed.startsWith('###BQ###')) {
        const text = this.stripHtml(trimmed.replace(/###\/?BQ###/g, ''))
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: [{ type: 'text', text: { content: text } }]
          }
        })
      } else if (trimmed.startsWith('###CODE###')) {
        const code = trimmed
          .replace(/###\/?CODE###/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: code } }],
            language: 'plain text'
          }
        })
      }
    }

    // If no blocks were created, add content as paragraphs
    if (blocks.length === 0) {
      const text = this.stripHtml(html)
      const paragraphs = text.split(/\n\n+/).filter(p => p.trim())
      for (const para of paragraphs) {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: para.trim() } }]
          }
        })
      }
    }

    return blocks
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim()
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
