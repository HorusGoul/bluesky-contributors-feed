export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  contributor_did: ContributorDid
  repo_contributor: RepoContributor
}

export type Post = {
  uri: string
  cid: string
  indexedAt: string
  author: string
}

export type SubState = {
  service: string
  cursor: number
}

export type ContributorDid = {
  did: string
  githubHandle: string
  lastSyncedAt: string
  lastBackfilledAt: string
}

export type RepoContributor = {
  repo: string
  contributorDid: string
}
