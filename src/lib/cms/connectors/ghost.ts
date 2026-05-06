import axios from 'axios'
import jwt from 'jsonwebtoken'
import type { CMSConnector, CMSCredentials, CMSPost, ArticleForCMS, CMSTag } from '../types'

export class GhostConnector implements CMSConnector {
  type = 'ghost' as const

  private generateToken(credentials: CMSCredentials): string {
    if (!credentials.apiKey) {
      throw new Error('Ghost requires an Admin API key')
    }

    // Ghost Admin API key format: {id}:{secret}
    const [id, secret] = credentials.apiKey.split(':')

    const token = jwt.sign({}, Buffer.from(secret, 'hex'), {
      keyid: id,
      algorithm: 'HS256',
      expiresIn: '5m',
      audience: '/admin/'
    })

    return token
  }

  async testConnection(credentials: CMSCredentials): Promise<boolean> {
    try {
      const token = this.generateToken(credentials)
      const response = await axios.get(
        `${credentials.siteUrl}/ghost/api/admin/site/`,
        {
          headers: { Authorization: `Ghost ${token}` }
        }
      )
      return response.status === 200
    } catch {
      return false
    }
  }

  async createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    const token = this.generateToken(credentials)

    const response = await axios.post(
      `${credentials.siteUrl}/ghost/api/admin/posts/`,
      {
        posts: [{
          title: article.title,
          slug: article.slug,
          html: article.contentHtml,
          custom_excerpt: article.metaDescription,
          meta_title: article.metaTitle,
          meta_description: article.metaDescription,
          status: 'published',
          feature_image: article.featuredImageUrl
        }]
      },
      {
        headers: {
          Authorization: `Ghost ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const post = response.data.posts[0]

    return {
      id: post.id,
      url: post.url,
      status: post.status
    }
  }

  async updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost> {
    const token = this.generateToken(credentials)

    // First get the current post to get updated_at
    const currentPost = await this.getPost(postId, credentials)
    if (!currentPost) {
      throw new Error('Post not found')
    }

    const getResponse = await axios.get(
      `${credentials.siteUrl}/ghost/api/admin/posts/${postId}/`,
      {
        headers: { Authorization: `Ghost ${token}` }
      }
    )

    const response = await axios.put(
      `${credentials.siteUrl}/ghost/api/admin/posts/${postId}/`,
      {
        posts: [{
          title: article.title,
          slug: article.slug,
          html: article.contentHtml,
          custom_excerpt: article.metaDescription,
          meta_title: article.metaTitle,
          meta_description: article.metaDescription,
          feature_image: article.featuredImageUrl,
          updated_at: getResponse.data.posts[0].updated_at
        }]
      },
      {
        headers: {
          Authorization: `Ghost ${token}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const post = response.data.posts[0]

    return {
      id: post.id,
      url: post.url,
      status: post.status
    }
  }

  async deletePost(postId: string, credentials: CMSCredentials): Promise<void> {
    const token = this.generateToken(credentials)

    await axios.delete(
      `${credentials.siteUrl}/ghost/api/admin/posts/${postId}/`,
      {
        headers: { Authorization: `Ghost ${token}` }
      }
    )
  }

  async getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null> {
    try {
      const token = this.generateToken(credentials)

      const response = await axios.get(
        `${credentials.siteUrl}/ghost/api/admin/posts/${postId}/`,
        {
          headers: { Authorization: `Ghost ${token}` }
        }
      )

      const post = response.data.posts[0]

      return {
        id: post.id,
        url: post.url,
        status: post.status
      }
    } catch {
      return null
    }
  }

  async getTags(credentials: CMSCredentials): Promise<CMSTag[]> {
    const token = this.generateToken(credentials)

    const response = await axios.get(
      `${credentials.siteUrl}/ghost/api/admin/tags/`,
      {
        headers: { Authorization: `Ghost ${token}` }
      }
    )

    return response.data.tags.map((tag: { id: string; name: string; slug: string }) => ({
      id: tag.id,
      name: tag.name,
      slug: tag.slug
    }))
  }
}
