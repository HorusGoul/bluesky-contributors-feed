import { Octokit } from '@octokit/rest'
import { HandleResolver } from '@atproto/identity'
import { Database } from './db'
import { backfillDid } from './backfill'

const repositories = ['bluesky-social/social-app']

export async function findContributors(octokit: Octokit, db: Database) {
  const execute = () => run(octokit, db).catch((error) => console.error(error))

  execute()

  // Find contributors every hour
  setInterval(execute, 1000 * 60 * 60)
}

async function run(octokit: Octokit, db: Database) {
  const handleResolver = new HandleResolver()
  const repoContributors = await Promise.all(
    repositories.map(async (fullRepo) => {
      const [owner, repo] = fullRepo.split('/')

      const contributors = await octokit.paginate(
        'GET /repos/{owner}/{repo}/contributors',
        {
          owner,
          repo,
        },
      )

      return contributors.map((contributor) => ({
        contributor,
        owner,
        repo,
      }))
    }),
  )

  const uniqueContributorLogins = new Set<string>()
  const contributorsByRepo = new Map<string, Set<string>>()

  for (const { contributor, owner, repo } of repoContributors.flat()) {
    if (!contributor.login) {
      continue
    }

    const fullRepo = `${owner}/${repo}`
    let set = contributorsByRepo.get(fullRepo)

    if (!set) {
      set = new Set()
      contributorsByRepo.set(fullRepo, set)
    }

    set.add(contributor.login)
    uniqueContributorLogins.add(contributor.login)
  }

  function findReposByContributor(contributor: string) {
    let repos = new Set<string>()

    for (const [repo, contributors] of contributorsByRepo.entries()) {
      if (contributors.has(contributor)) {
        repos.add(repo)
      }
    }

    return [...repos]
  }

  const handles = new Set<string>()
  const foundDids = new Set<string>()

  for (const contributor of uniqueContributorLogins) {
    type UserResponse = {
      websiteUrl: string
      socialAccounts: {
        nodes: {
          url: string
        }[]
      }
    }

    type Response = {
      user: UserResponse
    }

    const cachedContributor = await db
      .selectFrom('contributor_did')
      .selectAll()
      .where('githubHandle', '=', contributor)
      .executeTakeFirst()

    if (cachedContributor) {
      // Check lastSyncedAt, if it's been less than 1 week, skip
      const lastSyncedAt = new Date(cachedContributor.lastSyncedAt)
      const now = new Date()
      const diff = now.getTime() - lastSyncedAt.getTime()
      const oneWeek = 1000 * 60 * 60 * 24 * 7

      if (diff < oneWeek) {
        continue
      }
    }

    const data = await octokit.graphql<Response>(/* GraphQL */ `
      query {
        user(login: "${contributor}") {
          websiteUrl
          socialAccounts(first: 100) {
            nodes {
              url
            }
          }
        }
      }
    `)

    const possibleHandles = [
      data.user.websiteUrl,
      ...data.user.socialAccounts.nodes.map((node) => node.url),
    ]

    for (const url of possibleHandles) {
      if (!url) {
        continue
      }

      if (!url.startsWith('https://bsky.app/profile/')) {
        continue
      }

      const handle = url.replace('https://bsky.app/profile/', '').split('/')[0]
      handles.add(handle)

      handleResolver
        .resolve(handle)
        .then((did) => {
          if (!did) {
            return
          }

          did = did.trim()
          console.log(`Found DID for ${handle}: ${did}`)
          foundDids.add(did)

          const contributorRepositories = findReposByContributor(contributor)

          for (const repo of contributorRepositories) {
            db.insertInto('repo_contributor')
              .values({ repo, contributorDid: did })
              .onConflict((oc) => oc.doNothing())
              .execute()
              .catch(() => null)
          }

          db.insertInto('contributor_did')
            .values({
              did,
              githubHandle: contributor,
              lastSyncedAt: new Date().toISOString(),
              lastBackfilledAt: new Date(0).toISOString(),
            })
            .onConflict((oc) =>
              oc.doUpdateSet({
                did,
                githubHandle: contributor,
                lastSyncedAt: new Date().toISOString(),
              }),
            )
            .execute()
            .then(() => {
              return backfillDid(did, db)
            })
            .catch(() => null)
        })
        .catch(() => null)
    }
  }
}
