import { Kysely, Migration, MigrationProvider } from 'kysely'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'integer', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('contributor_did')
      .addColumn('did', 'varchar', (col) => col.primaryKey())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('contributor_did').execute()
  },
}

migrations['003'] = {
  async up(db: Kysely<unknown>) {
    // @ts-ignore
    await db.deleteFrom('sub_state').execute()
    // @ts-ignore
    await db.deleteFrom('post').execute()
    // @ts-ignore
    await db.deleteFrom('contributor_did').execute()

    // Add GitHub handle to contributor_did
    await db.schema
      .alterTable('contributor_did')
      .addColumn('githubHandle', 'varchar')
      .execute()

    // Add last sync time to contributor_did
    await db.schema
      .alterTable('contributor_did')
      .addColumn('lastSyncedAt', 'varchar', (col) => col.notNull())
      .execute()

    // Add last backfill time to contributor_did
    await db.schema
      .alterTable('contributor_did')
      .addColumn('lastBackfilledAt', 'varchar', (col) => col.notNull())
      .execute()

    // Index the GitHub handle
    await db.schema
      .createIndex('contributor_did_githubHandle_index')
      .on('contributor_did')
      .column('githubHandle')
      .execute()

    // Add owner did to post
    await db.schema
      .alterTable('post')
      .addColumn('author', 'varchar', (col) => col.notNull())
      .execute()

    await db.schema
      .createIndex('post_author_index')
      .on('post')
      .column('author')
      .execute()

    await db.schema
      .createTable('repo_contributor')
      .addColumn('repo', 'varchar', (col) => col.notNull())
      .addColumn('contributorDid', 'varchar', (col) => col.notNull())
      .addPrimaryKeyConstraint('repo_contributorDid', [
        'repo',
        'contributorDid',
      ])
      .execute()
  },
  async down(db: Kysely<unknown>) {},
}
