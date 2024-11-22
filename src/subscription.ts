import { cpus } from 'os'
import {
  Commit,
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase } from './util/subscription'
import { Worker } from 'worker_threads'
import { Remote, wrap } from 'comlink'
import nodeEndpoint from 'comlink/dist/esm/node-adapter.mjs'
import { CommitHandlerWorkerType } from './worker'
import path from 'path'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  private workers: Remote<CommitHandlerWorkerType>[] = []

  async createWorkers() {
    const workerCount = cpus().length - 1

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(
        path.resolve(__dirname, './worker.entrypoint.mjs'),
        {
          execArgv: ['--import', 'tsx'],
        },
      )
      const workerApi = wrap<CommitHandlerWorkerType>(nodeEndpoint(worker))

      this.workers.push(workerApi)
    }

    await Promise.all(
      this.workers.map((worker, index) => worker.init(index.toString())),
    )
  }

  async handleEvent(evt: Commit) {
    const worker = this.workers[evt.seq % this.workers.length]
    await worker.handleCommit({
      blocks: evt.blocks,
      repo: evt.repo,
      ops: evt.ops.map((op) => ({
        action: op.action,
        cid: op.cid?.toString(),
        path: op.path,
      })),
    })
  }
}
