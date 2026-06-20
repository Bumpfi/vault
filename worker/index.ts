import { Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { pollVods } from '#/lib/poll-vods.ts'
import { checkAvailability } from '#/lib/availability.ts'
import { refreshUserToken } from './jobs/token-refresh.ts'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const QUEUE = 'vault'

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

const queue = new Queue(QUEUE, { connection })

const worker = new Worker(
  QUEUE,
  async (job) => {
    switch (job.name) {
      case 'poll-vods':
        return pollVods()
      case 'availability-check':
        return checkAvailability()
      case 'token-refresh':
        return refreshUserToken()
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  { connection },
)

worker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.name} failed:`, err)
})

async function main() {
  // Repeatable schedules.
  await queue.upsertJobScheduler(
    'poll-vods',
    { every: 15 * 60 * 1000 },
    { name: 'poll-vods' },
  )
  await queue.upsertJobScheduler(
    'availability-check',
    { every: 6 * 60 * 60 * 1000 },
    { name: 'availability-check' },
  )
  await queue.upsertJobScheduler(
    'token-refresh',
    { every: 60 * 60 * 1000 },
    { name: 'token-refresh' },
  )
  // Run an immediate poll on startup.
  await queue.add('poll-vods', {})
  console.log(`[worker] up. Redis=${REDIS_URL}, queue=${QUEUE}`)
}

main().catch((err) => {
  console.error('[worker] fatal:', err)
  process.exit(1)
})

async function shutdown() {
  console.log('[worker] shutting down…')
  await worker.close()
  await queue.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
