import { BskyAgent } from '@atproto/api'
import { Database } from './db'
import { Post } from './db/schema'

export async function setupBackfill(db: Database) {
  // Backfill every hour
  setInterval(
    () =>
      scheduledBackfill(db).catch((error) =>
        console.error(
          `Failed to backfill at ${new Date().toISOString()}`,
          error,
        ),
      ),
    1000 * 60 * 60,
  )

  // Backfill on startup
  scheduledBackfill(db).catch((error) =>
    console.error('Failed to backfill on startup:', error),
  )
}

async function scheduledBackfill(db: Database) {
  const oneHourAgo = new Date(Date.now() - 1000 * 60 * 60).toISOString()
  const contributors = await db
    .selectFrom('contributor_did')
    .selectAll()
    .where('lastBackfilledAt', '<', oneHourAgo)
    .execute()

  // Backfill one by one
  for (const contributor of contributors) {
    await backfillDid(contributor.did, db).catch((error) =>
      console.error(`Failed to backfill ${contributor.did}`, error),
    )
  }
}

export async function backfillDid(did: string, db: Database) {
  const bskyAgent = new BskyAgent({
    service: 'https://public.api.bsky.app',
  })

  const cachedContributor = await db
    .selectFrom('contributor_did')
    .selectAll()
    .where('did', '=', did)
    .executeTakeFirst()
    .catch((error) => {
      console.error('Failed to fetch contributor:', error)
      return null
    })

  if (!cachedContributor) {
    return
  }

  const { lastBackfilledAt } = cachedContributor

  if (lastBackfilledAt) {
    const lastBackfilledDate = new Date(lastBackfilledAt)
    const now = new Date()

    // Don't backfill if we've backfilled in the last hour
    if (now.getTime() - lastBackfilledDate.getTime() < 1000 * 60 * 60) {
      return
    }
  }

  console.log(`Backfilling posts for ${did}`)

  const response = await bskyAgent.getAuthorFeed({
    actor: did,
    filter: 'posts_no_replies',
    limit: 100,
  })

  if (!response.success) {
    throw new Error(`Failed to fetch feed for ${did}`)
  }

  const { feed } = response.data
  const posts: Post[] = []

  for (const { post, reason = undefined } of feed) {
    if (reason) {
      continue
    }

    posts.push({
      uri: post.uri,
      cid: post.cid,
      indexedAt: post.indexedAt,
      author: post.author.did,
    })
  }

  if (posts.length > 0) {
    await db
      .insertInto('post')
      .values(posts)
      .onConflict((cf) => cf.doNothing())
      .execute()
      .catch((error) => {
        throw new Error(`Failed to save posts for ${did}`, { cause: error })
      })
  }

  await db
    .updateTable('contributor_did')
    .where('did', '=', did)
    .set('lastBackfilledAt', new Date().toISOString())
    .execute()
    .catch((error) => {
      console.error('Failed to update last backfill time:', error)
    })
}
