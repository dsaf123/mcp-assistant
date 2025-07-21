import { Kysely, Migration, MigrationProvider } from 'kysely'

export class MCPMigrationProvider implements MigrationProvider {

    constructor(
        private migrations: Record<string, MCPMigration>,
      ) {}
    async getMigrations(): Promise<Record<string, Migration>> {
        const mcpMigrations: Record<string, Migration> = {}
        Object.entries(this.migrations).forEach(([name, migration]) => {
            mcpMigrations[name] = {
                up: async (db) => await migration.up(db),
                down: async (db) => await migration.down?.(db)
            }
        })
        return mcpMigrations
    }
}

export interface MCPMigration {
    up(db: Kysely<unknown>): Promise<void>
    down?(db: Kysely<unknown>): Promise<void>
  }