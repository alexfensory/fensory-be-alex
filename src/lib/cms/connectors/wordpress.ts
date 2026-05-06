import axios from 'axios'
import type { CMSConnector, CMSCredentials, CMSPost, ArticleForCMS, CMSCategory, CMSTag, CMSMediaItem } from '../types'

export class WordPressConnector implements CMSConnector {
  type = 'wordpress' as const

  private getAuthHeader(credentials: CMSCredentials): string {
    if (credentials.accessToken) {
      return `Bearer ${credentials.accessToken}`
    }
    if (credentials.username && credentials.password) {
      const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')
      return `Basic ${encoded}`
    }
    throw new Error('No valid authentication credentials')
  }

  async testConnection(credentials: CMSCredentials): Promise<boolean> {
    try {
      const response = await axios.get(
        `${credentials.siteUrl}/wp-json/wp/v2/users/me`,
        {
          headers: { Authorization: this.getAuthHeader(credentials) }
        }
      )
      return response.status === 200
    } catch {
      return false
    }
  }

  async createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    const response = await axios.post(
      `${credentials.siteUrl}/wp-json/wp/v2/posts`,
      {
        title: article.title,
        content: article.contentHtml,
        status: 'publish',
        excerpt: article.metaDescription,
        slug: article.slug,
        meta: {
          _yoast_wpseo_title: article.metaTitle,
          _yoast_wpseo_metadesc: article.metaDescription
        }
      },
      {
        headers: {
          Authorization: this.getAuthHeader(credentials),
          'Content-Type': 'application/json'
        }
      }
    )

    return {
      id: response.data.id.toString(),
      url: response.data.link,
      status: response.data.status
    }
  }

  async updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    const response = await axios.put(
      `${credentials.siteUrl}/wp-json/wp/v2/posts/${postId}`,
      {
        title: article.title,
        content: article.contentHtml,
        excerpt: article.metaDescription,
        slug: article.slug,
        meta: {
          _yoast_wpseo_title: article.metaTitle,
          _yoast_wpseo_metadesc: article.metaDescription
        }
      },
      {
        headers: {
          Authorization: this.getAuthHeader(credentials),
          'Content-Type': 'application/json'
        }
      }
    )

    return {
      id: response.data.id.toString(),
      url: response.data.link,
      status: response.data.status
    }
  }

  async deletePost(postId: string, credentials: CMSCredentials): Promise<void> {
    await axios.delete(
      `${credentials.siteUrl}/wp-json/wp/v2/posts/${postId}`,
      {
        headers: { Authorization: this.getAuthHeader(credentials) }
      }
    )
  }

  async getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null> {
    try {
      const response = await axios.get(
        `${credentials.siteUrl}/wp-json/wp/v2/posts/${postId}`,
        {
          headers: { Authorization: this.getAuthHeader(credentials) }
        }
      )

      return {
        id: response.data.id.toString(),
        url: response.data.link,
        status: response.data.status
      }
    } catch {
      return null
    }
  }

  async getCategories(credentials: CMSCredentials): Promise<CMSCategory[]> {
    const response = await axios.get(
      `${credentials.siteUrl}/wp-json/wp/v2/categories`,
      {
        headers: { Authorization: this.getAuthHeader(credentials) }
      }
    )

    return response.data.map((cat: { id: number; name: string; slug: string }) => ({
      id: cat.id.toString(),
      name: cat.name,
      slug: cat.slug
    }))
  }

  async getTags(credentials: CMSCredentials): Promise<CMSTag[]> {
    const response = await axios.get(
      `${credentials.siteUrl}/wp-json/wp/v2/tags`,
      {
        headers: { Authorization: this.getAuthHeader(credentials) }
      }
    )

    return response.data.map((tag: { id: number; name: string; slug: string }) => ({
      id: tag.id.toString(),
      name: tag.name,
      slug: tag.slug
    }))
  }

  async uploadMedia(file: Buffer, filename: string, credentials: CMSCredentials): Promise<CMSMediaItem> {
    const formData = new FormData()
    formData.append('file', new Blob([file]), filename)

    const response = await axios.post(
      `${credentials.siteUrl}/wp-json/wp/v2/media`,
      formData,
      {
        headers: {
          Authorization: this.getAuthHeader(credentials),
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      }
    )

    return {
      id: response.data.id.toString(),
      url: response.data.source_url,
      filename: response.data.title.rendered
    }
  }
}
