export type DatabaseSchema = {
  post: Post
  sub_state: SubState
  contributor_did: ContributorDid
}

export type Post = {
  uri: string
  cid: string
  indexedAt: string
}

export type SubState = {
  service: string
  cursor: number
}

export type ContributorDid = {
  did: string
}
