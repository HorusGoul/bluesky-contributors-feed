import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  private didsList = new Set<string>()
  private lastDidsListUpdate = 0
  private didUpdateInProgress = false

  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    this.updateDidsList()

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        return this.didsList.has(create.author)
      })
      .map((create) => {
        return {
          uri: create.uri,
          cid: create.cid,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }

  async updateDidsList() {
    try {
      if (this.didUpdateInProgress) {
        return
      }

      this.didUpdateInProgress = true

      // update the list of DIDs every 5 seconds
      if (Date.now() - this.lastDidsListUpdate > 5 * 1000) {
        const contributors = await this.db
          .selectFrom('contributor_did')
          .select('did')
          .execute()

        this.didsList = new Set(
          contributors.map((contributor) => contributor.did),
        )
        this.lastDidsListUpdate = Date.now()
      }
    } catch (err) {
      console.error('could not update DIDs list', err)
    } finally {
      this.didUpdateInProgress = false
    }
  }
}
