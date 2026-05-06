import { articleWorker } from '../src/lib/workers/article-worker'
import { crawlWorker } from '../src/lib/workers/crawl-worker'
import { cmsWorker } from '../src/lib/workers/cms-worker'
import { agentWorker } from '../src/lib/workers/agent-worker'
import { indexingWorker } from '../src/lib/workers/indexing-worker'
import { performanceWorker } from '../src/lib/workers/performance-worker'

const workers = {
  article: articleWorker,
  crawl: crawlWorker,
  cms: cmsWorker,
  agent: agentWorker,
  indexing: indexingWorker,
  performance: performanceWorker
}

type WorkerName = keyof typeof workers

const target = process.argv[2] as WorkerName | 'all' | undefined

async function main() {
  console.log('========================================')
  console.log('       Verba Background Workers')
  console.log('========================================')
  console.log('')

  if (!target || target === 'all') {
    console.log('Starting all workers:')
    console.log('  - article     : Article generation')
    console.log('  - crawl       : Brand website crawling')
    console.log('  - cms         : CMS publishing')
    console.log('  - agent       : Agent notifications')
    console.log('  - indexing    : URL indexing checks')
    console.log('  - performance : GSC performance sync')
  } else if (workers[target]) {
    console.log(`Starting ${target} worker only...`)
  } else {
    console.error(`Unknown worker: ${target}`)
    console.error(`Available workers: ${Object.keys(workers).join(', ')}, all`)
    process.exit(1)
  }

  console.log('')
  console.log('Workers are running. Press Ctrl+C to stop.')
  console.log('========================================')
}

// Graceful shutdown
async function shutdown() {
  console.log('\n========================================')
  console.log('Shutting down workers...')

  try {
    await Promise.all(
      Object.entries(workers).map(async ([name, worker]) => {
        console.log(`  Closing ${name} worker...`)
        await worker.close()
      })
    )
    console.log('All workers stopped.')
    console.log('========================================')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

main().catch((error) => {
  console.error('Failed to start workers:', error)
  process.exit(1)
})
