import axios from 'axios'

const FIRECRAWL_API = 'https://api.firecrawl.dev/v1'

export interface CrawlOptions {
  depth?: number
  maxPages?: number
  excludePatterns?: string[]
}

export interface CrawledPage {
  url: string
  title: string
  content: string
  metadata?: Record<string, unknown>
}

export async function crawlWebsite(
  url: string,
  options: CrawlOptions = {}
): Promise<CrawledPage[]> {
  const { depth = 3, maxPages = 50, excludePatterns = [] } = options

  if (!process.env.FIRECRAWL_API_KEY) {
    console.warn('FIRECRAWL_API_KEY not set, using mock data')
    return mockCrawl(url)
  }

  try {
    // Start crawl job
    const response = await axios.post(
      `${FIRECRAWL_API}/crawl`,
      {
        url,
        limit: maxPages,
        scrapeOptions: {
          formats: ['markdown'],
          onlyMainContent: true
        },
        maxDepth: depth,
        excludePaths: excludePatterns
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const jobId = response.data.id

    // Poll for completion
    let status = 'scraping'
    let results: CrawledPage[] = []
    let attempts = 0
    const maxAttempts = 60 // 5 minutes with 5-second intervals

    while ((status === 'scraping' || status === 'pending') && attempts < maxAttempts) {
      await sleep(5000)
      attempts++

      const statusResponse = await axios.get(
        `${FIRECRAWL_API}/crawl/${jobId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`
          }
        }
      )

      status = statusResponse.data.status

      if (status === 'completed') {
        results = statusResponse.data.data?.map((page: {
          metadata?: { sourceURL?: string; title?: string }
          markdown?: string
        }) => ({
          url: page.metadata?.sourceURL || url,
          title: page.metadata?.title || 'Untitled',
          content: page.markdown || '',
          metadata: page.metadata
        })) || []
      }
    }

    if (status !== 'completed') {
      console.error(`Crawl job ${jobId} did not complete, status: ${status}`)
      return []
    }

    return results
  } catch (error) {
    console.error('Firecrawl error:', error)
    throw new Error(`Failed to crawl website: ${(error as Error).message}`)
  }
}

export async function scrapeUrl(url: string): Promise<CrawledPage | null> {
  if (!process.env.FIRECRAWL_API_KEY) {
    return mockScrape(url)
  }

  try {
    const response = await axios.post(
      `${FIRECRAWL_API}/scrape`,
      {
        url,
        formats: ['markdown'],
        onlyMainContent: true
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const data = response.data.data

    return {
      url: data.metadata?.sourceURL || url,
      title: data.metadata?.title || 'Untitled',
      content: data.markdown || '',
      metadata: data.metadata
    }
  } catch (error) {
    console.error('Firecrawl scrape error:', error)
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Mock functions for development without API key
function mockCrawl(url: string): CrawledPage[] {
  return [
    {
      url,
      title: 'Home Page',
      content: `# Welcome to Our Website

This is sample content from ${url}. In a production environment, this would be actual crawled content from your website.

## About Us
We are a company dedicated to providing excellent services to our customers.

## Our Services
- Service 1
- Service 2
- Service 3

## Contact
Feel free to reach out to us for more information.`,
      metadata: { type: 'homepage' }
    },
    {
      url: `${url}/about`,
      title: 'About Us',
      content: `# About Our Company

We have been in business for over 10 years, providing top-quality services to our valued customers.

## Our Mission
To deliver exceptional value and service to every customer.

## Our Team
Our team consists of dedicated professionals with years of experience.`,
      metadata: { type: 'about' }
    }
  ]
}

function mockScrape(url: string): CrawledPage {
  return {
    url,
    title: 'Sample Page',
    content: `# Sample Content

This is sample scraped content from ${url}.

## Main Section
Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
    metadata: { type: 'page' }
  }
}
