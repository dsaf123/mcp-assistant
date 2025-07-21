import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('entity')
    .addColumn('user_id', 'varchar', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('type', 'varchar')
    .addColumn('created_at', 'timestamp', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    ).addPrimaryKeyConstraint('entity_pkey', ['user_id', 'name'])
    .execute()

  await db.schema
    .createTable('relation')
    .addColumn('user_id', 'varchar', (col) => col.notNull())
    .addColumn('from', 'varchar', (col) => col.notNull())
    .addColumn('to', 'varchar', (col) => col.notNull())
    .addColumn('type', 'varchar')
    .execute()

  await db.schema
    .createTable('entity_observation')
    .addColumn('user_id', 'varchar', (col) => col.notNull())
    .addColumn('entity_name', 'varchar', (col) => col.notNull())
    .addColumn('observation', 'varchar', (col) => col.notNull())
    .execute()


    
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('relation').execute()
  await db.schema.dropTable('entity').execute()
  await db.schema.dropTable('entity_observation').execute()
}