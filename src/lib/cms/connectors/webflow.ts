import axios from 'axios'
import type { CMSConnector, CMSCredentials, CMSPost, ArticleForCMS } from '../types'

export class WebflowConnector implements CMSConnector {
  type = 'webflow' as const
  private baseUrl = 'https://api.webflow.com/v2'

  getAuthUrl(tenantId: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.WEBFLOW_CLIENT_ID!,
      redirect_uri: redirectUri,
      response_type: 'code',
      state: tenantId
    })
    return `https://webflow.com/oauth/authorize?${params}`
  }

  async handleCallback(code: string, _tenantId: string): Promise<CMSCredentials> {
    const response = await axios.post('https://api.webflow.com/oauth/access_token', {
      client_id: process.env.WEBFLOW_CLIENT_ID,
      client_secret: process.env.WEBFLOW_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code'
    })

    return {
      accessToken: response.data.access_token,
      expiresAt: response.data.expires_in
        ? new Date(Date.now() + response.data.expires_in * 1000).toISOString()
        : undefined
    }
  }

  async refreshToken(credentials: CMSCredentials): Promise<CMSCredentials> {
    if (!credentials.refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await axios.post('https://api.webflow.com/oauth/access_token', {
      client_id: process.env.WEBFLOW_CLIENT_ID,
      client_secret: process.env.WEBFLOW_CLIENT_SECRET,
      refresh_token: credentials.refreshToken,
      grant_type: 'refresh_token'
    })

    return {
      ...credentials,
      accessToken: response.data.access_token,
      expiresAt: response.data.expires_in
        ? new Date(Date.now() + response.data.expires_in * 1000).toISOString()
        : undefined
    }
  }

  async testConnection(credentials: CMSCredentials): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` }
      })
      return response.status === 200
    } catch {
      return false
    }
  }

  async createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    if (!credentials.siteId || !credentials.collectionId) {
      throw new Error('Webflow requires siteId and collectionId')
    }

    // Create the item
    const response = await axios.post(
      `${this.baseUrl}/collections/${credentials.collectionId}/items`,
      {
        isArchived: false,
        isDraft: false,
        fieldData: {
          name: article.title,
          slug: article.slug,
          'post-body': article.contentHtml,
          'post-summary': article.metaDescription,
          'meta-title': article.metaTitle,
          'meta-description': article.metaDescription
        }
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const itemId = response.data.id

    // Publish the item
    await axios.post(
      `${this.baseUrl}/collections/${credentials.collectionId}/items/publish`,
      {
        itemIds: [itemId]
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    // Construct the URL (this depends on your Webflow site structure)
    const siteUrl = credentials.siteUrl || ''
    const url = `${siteUrl}/blog/${article.slug}`

    return {
      id: itemId,
      url,
      status: 'published'
    }
  }

  async updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    if (!credentials.collectionId) {
      throw new Error('Webflow requires collectionId')
    }

    await axios.patch(
      `${this.baseUrl}/collections/${credentials.collectionId}/items/${postId}`,
      {
        fieldData: {
          name: article.title,
          slug: article.slug,
          'post-body': article.contentHtml,
          'post-summary': article.metaDescription,
          'meta-title': article.metaTitle,
          'meta-description': article.metaDescription
        }
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    // Re-publish
    await axios.post(
      `${this.baseUrl}/collections/${credentials.collectionId}/items/publish`,
      {
        itemIds: [postId]
      },
      {
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const siteUrl = credentials.siteUrl || ''

    return {
      id: postId,
      url: `${siteUrl}/blog/${article.slug}`,
      status: 'published'
    }
  }

  async deletePost(postId: string, credentials: CMSCredentials): Promise<void> {
    if (!credentials.collectionId) {
      throw new Error('Webflow requires collectionId')
    }

    await axios.delete(
      `${this.baseUrl}/collections/${credentials.collectionId}/items/${postId}`,
      {
        headers: { Authorization: `Bearer ${credentials.accessToken}` }
      }
    )
  }

  async getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null> {
    if (!credentials.collectionId) {
      return null
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/collections/${credentials.collectionId}/items/${postId}`,
        {
          headers: { Authorization: `Bearer ${credentials.accessToken}` }
        }
      )

      const siteUrl = credentials.siteUrl || ''

      return {
        id: response.data.id,
        url: `${siteUrl}/blog/${response.data.fieldData?.slug || postId}`,
        status: response.data.isDraft ? 'draft' : 'published'
      }
    } catch {
      return null
    }
  }
}
