import axios from 'axios'

export interface ImageResult {
  url: string
  thumbnailUrl: string
  attribution: string
  source: 'unsplash' | 'pexels'
}

export async function sourceImages(
  query: string,
  count: number = 3
): Promise<ImageResult[]> {
  // Try Unsplash first
  if (process.env.UNSPLASH_ACCESS_KEY) {
    try {
      const images = await searchUnsplash(query, count)
      if (images.length > 0) {
        return images
      }
    } catch (error) {
      console.error('Unsplash search failed:', error)
    }
  }

  // Fallback to Pexels
  if (process.env.PEXELS_API_KEY) {
    try {
      const images = await searchPexels(query, count)
      if (images.length > 0) {
        return images
      }
    } catch (error) {
      console.error('Pexels search failed:', error)
    }
  }

  // Return empty array if no providers configured
  console.warn('No image providers configured')
  return []
}

async function searchUnsplash(query: string, count: number): Promise<ImageResult[]> {
  const response = await axios.get('https://api.unsplash.com/search/photos', {
    params: {
      query,
      per_page: count,
      orientation: 'landscape'
    },
    headers: {
      Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
    }
  })

  return response.data.results.map((img: {
    urls: { regular: string; thumb: string }
    user: { name: string }
  }) => ({
    url: img.urls.regular,
    thumbnailUrl: img.urls.thumb,
    attribution: `Photo by ${img.user.name} on Unsplash`,
    source: 'unsplash' as const
  }))
}

async function searchPexels(query: string, count: number): Promise<ImageResult[]> {
  const response = await axios.get('https://api.pexels.com/v1/search', {
    params: {
      query,
      per_page: count,
      orientation: 'landscape'
    },
    headers: {
      Authorization: process.env.PEXELS_API_KEY!
    }
  })

  return response.data.photos.map((img: {
    src: { large: string; tiny: string }
    photographer: string
  }) => ({
    url: img.src.large,
    thumbnailUrl: img.src.tiny,
    attribution: `Photo by ${img.photographer} on Pexels`,
    source: 'pexels' as const
  }))
}

export async function getFeaturedImage(title: string): Promise<string | null> {
  const images = await sourceImages(title, 1)
  return images.length > 0 ? images[0].url : null
}
