// Background worker: runs the scheduled jobs. A separate process from the
// web server so slow Twitch polling never competes with page requests.
import { Queue, Worker } from 'bullmq'
import type { JobsOptions } from 'bullmq'
import IORedis from 'ioredis'
import { env } from '#/server/env'
import { checkAvailability } from '#/server/jobs/check-availability'
import { pollVods } from '#/server/jobs/poll-vods'

// Queue and job names are stored in Redis alongside pending jobs, so they
// are part of the persisted data: renaming one strands jobs already queued
// under the old name.
const QUEUE = 'vault'
const SCHEDULES = {
  'poll-vods': 15 * 60_000,
  'availability-check': 6 * 60 * 60_000,
}

// BullMQ keeps finished jobs in Redis forever unless told otherwise; with a
// job every 15 minutes that grows without bound.
const jobOptions: JobsOptions = {
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
}

const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
const queue = new Queue(QUEUE, { connection, defaultJobOptions: jobOptions })

const worker = new Worker(
  QUEUE,
  async (job) => {
    switch (job.name) {
      case 'poll-vods':
        return pollVods()
      case 'availability-check':
        return checkAvailability()
      default:
        throw new Error(`Unknown job: ${job.name}`)
    }
  },
  // Started explicitly once the schedules are reconciled (see start()).
  { connection, autorun: false },
)

worker.on('failed', (job, err) => {
  console.error(`[worker] ${job?.name} failed:`, err)
})

async function start() {
  // upsert is idempotent, so restarts don't create duplicate schedules.
  for (const [name, every] of Object.entries(SCHEDULES)) {
    await queue.upsertJobScheduler(name, { every }, { name, opts: jobOptions })
  }
  // Drop schedules that were removed from the code.
  for (const scheduler of await queue.getJobSchedulers()) {
    if (!(scheduler.key in SCHEDULES)) await queue.removeJobScheduler(scheduler.key)
  }
  void worker.run()
  console.log('[worker] started')
}

async function shutdown() {
  console.log('[worker] shutting down')
  await worker.close() // lets the running job finish
  await queue.close()
  await connection.quit()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

start().catch((err: unknown) => {
  console.error('[worker] failed to start:', err)
  process.exit(1)
})
