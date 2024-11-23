import { Octokit } from '@octokit/rest'
import { DidResolver, HandleResolver } from '@atproto/identity'
import { Database } from './db'

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

      const data = await octokit.paginate(
        'GET /repos/{owner}/{repo}/contributors',
        {
          owner,
          repo,
        },
      )

      return data
    }),
  )
  const flatContributors = repoContributors
    .flat()
    .filter((contributor) => contributor.login) as { login: string }[]

  const uniqueContributorLogins = new Set(
    flatContributors.map((contributor) => contributor.login),
  )

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

          console.log(`Found DID for ${handle}: ${did}`)
          foundDids.add(did)

          db.insertInto('contributor_did')
            .values({ did })
            .onConflict((oc) => oc.doNothing())
            .execute()
            .catch(() => null)
        })
        .catch(() => null)
    }
  }
}
