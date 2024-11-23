# Bluesky Contributors Feed

This is the implementation of the [Bluesky Contributors feed](https://bsky.app/profile/did:plc:pe5lhpot2jvtxribylimv2is/feed/bskycontribs). Generated using the [bluesky-social/feed-generator](https://github.com/bluesky-social/feed-generator/) template.

## How it works

The feed is generated by looking for contributors in the Bluesky repositories on GitHub. The list of repositories is defined in the `repositories` array in `src/findContributors.ts`.

The feed is generated using the following steps:

1. Retrieve the list of contributors from GitHub using the GitHub API.
2. Look for Bluesky handles in the GitHub profiles of the contributors.
3. Store the list of contributors in SQLite.
4. At the same time, the server is always listening for new events from the Bluesky Firehose.
5. When a new event is received, we check if the event is a `Post` event and if the author of the post is in the list of contributors.
6. If the author is in the list of contributors, we add the post to the feed.

The feed is available at https://bsky.app/profile/did:plc:pe5lhpot2jvtxribylimv2is/feed/bskycontribs

## Using this feed as a template

First, good luck! This is a bunch of hacky code that I wrote while learning how to use the Firehose, and it's not very well documented.

Most of the code is similar to the [bluesky-social/feed-generator](https://github.com/bluesky-social/feed-generator/) template, but with some modifications to allow the following:

- Retrieve the list of contributors from GitHub
- Parallelize the processing of Firehose events using node workers
- Deploy to Fly.io

If you want to use this feed as a template, keep in mind the following:

- Copy `.env.example` to `.env` and fill in the required values, make sure to follow the instructions in the comments.
- Run `yarn` to install the dependencies.
- You can update the list of repositories to look for contributors in the `repositories` array in `src/findContributors.ts`.
- You'll need to figure out how to deploy this if you don't want to use Fly.io. The `fly.toml` file is included in the repository, but you'll need to set up your own Fly.io account and app and update the `fly.toml` file with your app name. You'll also need to set the `FEEDGEN_GITHUB_TOKEN` secret in your Fly.io app. Other environment variables are configured in the `fly.toml` file.

Feel free to ask me any questions on Bluesky at [@horus.dev](https://bsky.app/profile/did:plc:pe5lhpot2jvtxribylimv2is).

## How to contribute

If you want to contribute to this feed, please open an issue or reach out to me on Bluesky at [@horus.dev](https://bsky.app/profile/did:plc:pe5lhpot2jvtxribylimv2is) first. I'm happy to accept contributions, but I want to make sure that we're on the same page before you start working on something.