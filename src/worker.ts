import { Endpoint, expose } from 'comlink'
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs'
import { parentPort } from 'worker_threads'
import { createDb, Database } from './db'
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { getOpsByType, GetOpsParams } from './util/subscription'

const sqliteLocation = process.env.FEEDGEN_SQLITE_LOCATION ?? ':memory:'
const db = createDb(sqliteLocation)

class CommitHandlerWorker {
  private didsList = new Set<string>()
  private lastDidsListUpdate = 0
  private didUpdateInProgress = false
  private workerId: string

  constructor(private readonly db: Database) {}

  async init(id: string) {
    this.workerId = id
    await this.updateDidsList()
    console.log(`Worker ${id} initialized`)
  }

  async handleCommit(evt: GetOpsParams) {
    try {
      const ops = await getOpsByType(evt)

      this.updateDidsList()

      const postsToDelete = ops.posts.deletes.map((del) => del.uri)
      const postsToCreate = ops.posts.creates
        .filter((create) => {
          return (
            this.didsList.has(create.author) &&
            !create.record.reply &&
            create.record.createdAt &&
            create.record.createdAt < new Date().toISOString()
          )
        })
        .map((create) => {
          return {
            uri: create.uri,
            cid: create.cid,
            indexedAt: create.record.createdAt,
            author: create.author,
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

        console.log(
          `Worker ${this.workerId} inserted ${postsToCreate.length} posts`,
        )
      }
    } catch (error) {
      console.error(`[#${this.workerId}]Error handling commit`, error)
    }
  }

  async updateDidsList() {
    try {
      if (this.didUpdateInProgress) {
        return
      }

      this.didUpdateInProgress = true

      // update the list of DIDs every 60 seconds
      if (Date.now() - this.lastDidsListUpdate > 60 * 1000) {
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

if (!parentPort) {
  throw new Error('Execute this script as a worker')
}

expose(new CommitHandlerWorker(db), nodeEndpoint(parentPort))

export type CommitHandlerWorkerType = InstanceType<typeof CommitHandlerWorker>
