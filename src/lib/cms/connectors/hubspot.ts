import type { CMSConnector, CMSCredentials, CMSPost, ArticleForCMS, CMSTag } from '../types'

interface HubSpotBlogPost {
  id: string
  url: string
  state: string
  slug: string
  name: string
}

interface HubSpotTag {
  id: string
  name: string
  slug: string
}

export class HubSpotConnector implements CMSConnector {
  type = 'hubspot' as const
  private baseUrl = 'https://api.hubapi.com'

  private getHeaders(credentials: CMSCredentials) {
    return {
      'Authorization': `Bearer ${credentials.accessToken}`,
      'Content-Type': 'application/json'
    }
  }

  getAuthUrl(tenantId: string, redirectUri: string): string {
    const clientId = process.env.HUBSPOT_CLIENT_ID
    if (!clientId) throw new Error('HUBSPOT_CLIENT_ID not configured')

    const scopes = [
      'content',
      'oauth'
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scopes,
      state: tenantId
    })

    return `https://app.hubspot.com/oauth/authorize?${params.toString()}`
  }

  async handleCallback(code: string, _tenantId: string): Promise<CMSCredentials> {
    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/cms/hubspot/callback`

    if (!clientId || !clientSecret) {
      throw new Error('HubSpot OAuth credentials not configured')
    }

    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code
      }).toString()
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HubSpot OAuth error: ${error}`)
    }

    const data = await response.json()

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
    }
  }

  async refreshToken(credentials: CMSCredentials): Promise<CMSCredentials> {
    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret || !credentials.refreshToken) {
      throw new Error('Cannot refresh HubSpot token')
    }

    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: credentials.refreshToken
      }).toString()
    })

    if (!response.ok) {
      throw new Error('Failed to refresh HubSpot token')
    }

    const data = await response.json()

    return {
      ...credentials,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString()
    }
  }

  async testConnection(credentials: CMSCredentials): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/cms/v3/blogs/posts?limit=1`,
        { headers: this.getHeaders(credentials) }
      )
      return response.ok
    } catch {
      return false
    }
  }

  async createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    // Get or create tags
    const tagIds: string[] = []
    if (article.tags && article.tags.length > 0) {
      for (const tagName of article.tags) {
        const tagId = await this.getOrCreateTag(tagName, credentials)
        if (tagId) tagIds.push(tagId)
      }
    }

    const postData = {
      name: article.title,
      slug: article.slug,
      postBody: article.contentHtml,
      metaDescription: article.metaDescription,
      htmlTitle: article.metaTitle,
      featuredImage: article.featuredImageUrl || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined,
      state: 'PUBLISHED',
      publishDate: new Date().toISOString()
    }

    const response = await fetch(`${this.baseUrl}/cms/v3/blogs/posts`, {
      method: 'POST',
      headers: this.getHeaders(credentials),
      body: JSON.stringify(postData)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create HubSpot post: ${error}`)
    }

    const post: HubSpotBlogPost = await response.json()

    return {
      id: post.id,
      url: post.url || `https://app.hubspot.com/content/${post.id}`,
      status: post.state.toLowerCase()
    }
  }

  async updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    // Get or create tags
    const tagIds: string[] = []
    if (article.tags && article.tags.length > 0) {
      for (const tagName of article.tags) {
        const tagId = await this.getOrCreateTag(tagName, credentials)
        if (tagId) tagIds.push(tagId)
      }
    }

    const postData = {
      name: article.title,
      slug: article.slug,
      postBody: article.contentHtml,
      metaDescription: article.metaDescription,
      htmlTitle: article.metaTitle,
      featuredImage: article.featuredImageUrl || undefined,
      tagIds: tagIds.length > 0 ? tagIds : undefined
    }

    const response = await fetch(`${this.baseUrl}/cms/v3/blogs/posts/${postId}`, {
      method: 'PATCH',
      headers: this.getHeaders(credentials),
      body: JSON.stringify(postData)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to update HubSpot post: ${error}`)
    }

    const post: HubSpotBlogPost = await response.json()

    return {
      id: post.id,
      url: post.url || `https://app.hubspot.com/content/${post.id}`,
      status: post.state.toLowerCase()
    }
  }

  async deletePost(postId: string, credentials: CMSCredentials): Promise<void> {
    const response = await fetch(`${this.baseUrl}/cms/v3/blogs/posts/${postId}`, {
      method: 'DELETE',
      headers: this.getHeaders(credentials)
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to delete HubSpot post: ${error}`)
    }
  }

  async getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/cms/v3/blogs/posts/${postId}`,
        { headers: this.getHeaders(credentials) }
      )

      if (!response.ok) {
        if (response.status === 404) return null
        throw new Error('Failed to get HubSpot post')
      }

      const post: HubSpotBlogPost = await response.json()

      return {
        id: post.id,
        url: post.url || `https://app.hubspot.com/content/${post.id}`,
        status: post.state.toLowerCase()
      }
    } catch {
      return null
    }
  }

  async getTags(credentials: CMSCredentials): Promise<CMSTag[]> {
    const response = await fetch(
      `${this.baseUrl}/cms/v3/blogs/tags?limit=100`,
      { headers: this.getHeaders(credentials) }
    )

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data.results.map((tag: HubSpotTag) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }))
  }

  private async getOrCreateTag(name: string, credentials: CMSCredentials): Promise<string | null> {
    // Search for existing tag
    const searchResponse = await fetch(
      `${this.baseUrl}/cms/v3/blogs/tags?name=${encodeURIComponent(name)}`,
      { headers: this.getHeaders(credentials) }
    )

    if (searchResponse.ok) {
      const searchData = await searchResponse.json()
      const existingTag = searchData.results.find(
        (t: HubSpotTag) => t.name.toLowerCase() === name.toLowerCase()
      )
      if (existingTag) return existingTag.id
    }

    // Create new tag
    const createResponse = await fetch(`${this.baseUrl}/cms/v3/blogs/tags`, {
      method: 'POST',
      headers: this.getHeaders(credentials),
      body: JSON.stringify({
        name,
        slug: name.toLowerCase().replace(/\s+/g, '-')
      })
    })

    if (createResponse.ok) {
      const newTag: HubSpotTag = await createResponse.json()
      return newTag.id
    }

    return null
  }
}
