// Google Search Console Integration
// Note: Requires googleapis package: npm install googleapis

export interface PerformanceRow {
  page: string
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface IndexingStatus {
  isIndexed: boolean
  lastCrawled?: string
  verdict?: string
}

export async function getSearchPerformance(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<PerformanceRow[]> {
  // Check if Google API is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn('Google Search Console not configured, returning mock data')
    return getMockPerformanceData(siteUrl)
  }

  try {
    const { google } = await import('googleapis')

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    })

    const searchconsole = google.searchconsole({ version: 'v1', auth })

    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ['page', 'query'],
        rowLimit: 1000
      }
    })

    return response.data.rows?.map(row => ({
      page: row.keys![0],
      query: row.keys![1],
      clicks: row.clicks!,
      impressions: row.impressions!,
      ctr: row.ctr!,
      position: row.position!
    })) || []
  } catch (error) {
    console.error('GSC API error:', error)
    throw new Error(`Failed to fetch search performance: ${(error as Error).message}`)
  }
}

export async function checkUrlIndexing(url: string): Promise<IndexingStatus> {
  // Check if Google API is configured
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    console.warn('Google Search Console not configured, returning mock data')
    return getMockIndexingStatus()
  }

  try {
    const { google } = await import('googleapis')

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly']
    })

    const searchconsole = google.searchconsole({ version: 'v1', auth })

    // Extract site URL from the page URL
    const urlObj = new URL(url)
    const siteUrl = `${urlObj.protocol}//${urlObj.host}/`

    const response = await searchconsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: url,
        siteUrl
      }
    })

    const result = response.data.inspectionResult

    return {
      isIndexed: result?.indexStatusResult?.coverageState === 'INDEXED',
      lastCrawled: result?.indexStatusResult?.lastCrawlTime || undefined,
      verdict: result?.indexStatusResult?.verdict || undefined
    }
  } catch (error) {
    console.error('GSC URL inspection error:', error)
    throw new Error(`Failed to check URL indexing: ${(error as Error).message}`)
  }
}

// Mock data for development without GSC configured
function getMockPerformanceData(siteUrl: string): PerformanceRow[] {
  return [
    {
      page: `${siteUrl}/blog/sample-article`,
      query: 'sample search term',
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      position: 5.5
    },
    {
      page: `${siteUrl}/blog/another-article`,
      query: 'another search term',
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      position: 8.2
    }
  ]
}

function getMockIndexingStatus(): IndexingStatus {
  return {
    isIndexed: true,
    lastCrawled: new Date().toISOString(),
    verdict: 'PASS'
  }
}
