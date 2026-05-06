import { articleWorker } from '../src/lib/workers/article-worker'
import { crawlWorker } from '../src/lib/workers/crawl-worker'
import { cmsWorker } from '../src/lib/workers/cms-worker'
import { agentWorker } from '../src/lib/workers/agent-worker'

const workers = {
  article: articleWorker,
  crawl: crawlWorker,
  cms: cmsWorker,
  agent: agentWorker
}

type WorkerName = keyof typeof workers

const target = process.argv[2] as WorkerName | 'all' | undefined

async function main() {
  console.log('Starting Verba workers...')

  if (!target || target === 'all') {
    console.log('Starting all workers...')
    console.log('- Article generation worker')
    console.log('- Brand crawl worker')
    console.log('- CMS publish worker')
    console.log('- Agent dispatch worker')
  } else if (workers[target]) {
    console.log(`Starting ${target} worker only...`)
  } else {
    console.error(`Unknown worker: ${target}`)
    console.error(`Available workers: ${Object.keys(workers).join(', ')}, all`)
    process.exit(1)
  }

  console.log('\nWorkers are running. Press Ctrl+C to stop.\n')
}

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down workers...')

  try {
    await Promise.all(
      Object.entries(workers).map(async ([name, worker]) => {
        console.log(`Closing ${name} worker...`)
        await worker.close()
      })
    )
    console.log('All workers stopped.')
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
