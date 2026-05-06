export type CMSConnectorType = 'wordpress' | 'webflow' | 'ghost' | 'notion' | 'hubspot' | 'custom'

export interface CMSCredentials {
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  siteUrl?: string
  username?: string
  password?: string
  expiresAt?: string
  collectionId?: string
  siteId?: string
}

export interface CMSPost {
  id: string
  url: string
  status: string
}

export interface CMSCategory {
  id: string
  name: string
  slug: string
}

export interface CMSTag {
  id: string
  name: string
  slug: string
}

export interface CMSMediaItem {
  id: string
  url: string
  filename: string
}

export interface ArticleForCMS {
  title: string
  slug: string
  content: string
  contentHtml: string
  metaTitle: string
  metaDescription: string
  featuredImageUrl?: string
  categories?: string[]
  tags?: string[]
}

export interface CMSConnector {
  type: CMSConnectorType

  // OAuth (if applicable)
  getAuthUrl?(tenantId: string, redirectUri: string): string
  handleCallback?(code: string, tenantId: string): Promise<CMSCredentials>
  refreshToken?(credentials: CMSCredentials): Promise<CMSCredentials>

  // Connection testing
  testConnection(credentials: CMSCredentials): Promise<boolean>

  // Post operations
  createPost(article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost>
  updatePost(postId: string, article: ArticleForCMS, credentials: CMSCredentials): Promise<CMSPost>
  deletePost(postId: string, credentials: CMSCredentials): Promise<void>
  getPost(postId: string, credentials: CMSCredentials): Promise<CMSPost | null>

  // Optional operations
  getCategories?(credentials: CMSCredentials): Promise<CMSCategory[]>
  getTags?(credentials: CMSCredentials): Promise<CMSTag[]>
  uploadMedia?(file: Buffer, filename: string, credentials: CMSCredentials): Promise<CMSMediaItem>
}
