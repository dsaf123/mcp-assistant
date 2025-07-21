import { Client, ClientConfig } from 'pg';
import { Database } from './dataplane/types';
import { Pool } from 'pg';
import { promises as fs } from 'fs'
import { Kysely, PostgresDialect, Migrator, FileMigrationProvider } from 'kysely';
import * as path from 'path'
import * as migrations from './dataplane/migrations'
import { MCPMigrationProvider } from './dataplane/migrations/provider'



export async function testDatabaseConnection(hyperdrive: Hyperdrive) {
    try {

        const sql = new Client({
            connectionString: hyperdrive.connectionString,
            ssl: true
        });

        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })

        const migrator = new Migrator({
            db: db,
            migrationTableSchema: 'public',
            provider: new MCPMigrationProvider(migrations),
          })
        
        const { error, results } = await migrator.migrateToLatest()

        results?.forEach((it) => {
            if (it.status === 'Success') {
              console.log(`migration "${it.migrationName}" was executed successfully`)
            } else if (it.status === 'Error') {
              console.error(`failed to execute migration "${it.migrationName}"`)
            }
          })
        
          if (error) {
            console.error('failed to migrate')
            console.error(error)
          }

        console.log("Migrations results:", results);

        const result2 = await db.selectFrom('entity').selectAll().execute();
        console.log("Result2:", result2);

        console.log("Connection String:", hyperdrive.connectionString);

        const result = await sql.connect();
        console.log("Database connection successful:", result);
        return { success: true, result };
    } catch (error) {
        console.error("Database connection failed:", error);
        return { success: false, error: error };
    }
}

export async function createUsersCollection(hyperdrive: Hyperdrive) {
    try {
        // Create users collection with validation
        const sql = new Client(hyperdrive.connectionString);
        await sql.connect();
        const db = await sql.query(`CREATE TABLE IF NOT EXISTS memories (
            id SERIAL PRIMARY KEY, 
            userId VARCHAR(255) NOT NULL, 
            record JSONB NOT NULL, 
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
        console.log("Users table created successfully:", db);

        console.log("Users collection created successfully");
        return { success: true };
    } catch (error) {
        console.error("Failed to create users collection:", error);
        return { success: false, error: error };
    }
}

export async function createEntities(hyperdrive: Hyperdrive, userId: string, entities: Entity[] ) {
    try {
        // Create users collection with validation
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })


        for (const entity of entities) {
            const result = await db.insertInto('entity').values({
                user_id: userId,
                name: entity.name,
                type: entity.entityType,
            }).execute();
            console.log("Entity stored successfully:", result);

            await createEntityObservations(hyperdrive, userId, entity.name, entity.observations);
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to store entities:", error);
        return { success: false, error: error };
    }
}

export async function createRelations(hyperdrive: Hyperdrive, user_id: string, relations: Relation[] ) {
    try {
        // Create users collection with validation
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })


        for (const relation of relations) {
            const result = await db.insertInto('relation').values({
                user_id,
                from: relation.from,
                to: relation.to,
                type: relation.relationType,
            }).execute();
            console.log("Relation stored successfully:", result);
        }

        return { success: true };
    } catch (error) {
        console.error("Failed to store relations:", error);
        return { success: false, error: error };
    }
}

export async function createEntityObservations(hyperdrive: Hyperdrive, user_id: string, entity_name: string, observations: string[] ) {
    try {
        // Create users collection with validation
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })


        for (const observation of observations) {
            const result = await db.insertInto('entity_observation').values({
                user_id,
                entity_name,
                observation,
            }).execute();
            console.log("Entity observation stored successfully:", result);
        }
        
        return { success: true };
    } catch (error) {
        console.error("Failed to store entities:", error);
        return { success: false, error: error };
    }
}

export async function add_observations(hyperdrive: Hyperdrive, user_id: string, entity_name: string, observations: string[] ) {
    try {

        const result = await createEntityObservations(hyperdrive, user_id, entity_name, observations);

        return { success: true, result };
    } catch (error) {
        console.error("Failed to store memory:", error);
        return { success: false, error: error };
    }
}

export async function deleteEntities(hyperdrive: Hyperdrive, user_id: string, entity_names: string[] ) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })

        for (const entity_name of entity_names) {
            const result = await db.deleteFrom('entity').where('user_id', '=', user_id).where('name', '=', entity_name).execute();
            console.log("Entity deleted successfully:", result);
        }

        return { success: true};
    } catch (error) {
        console.error("Failed to delete entities:", error);
        return { success: false, error: error };
    }
}

export async function deleteRelations(hyperdrive: Hyperdrive, user_id: string, relations: Relation[] ) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })

        const db = new Kysely<Database>({
            dialect,
        })

        for (const relation of relations) {
            const result = await 
            db.deleteFrom('relation'

                ).where('user_id', '=', user_id
                ).where('from', '=', relation.from
                ).where('to', '=', relation.to
                ).where('type', '=', relation.relationType
                ).execute();
            console.log("Relation deleted successfully:", result);
        }

        return { success: true};
    } catch (error) {
        console.error("Failed to delete relations:", error);
        return { success: false, error: error };
    }
}

export async function deleteObservations(hyperdrive: Hyperdrive, user_id: string, entity_name: string, observations: string[] ) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })          
        const db = new Kysely<Database>({
            dialect,
        })


        for (const observation of observations) {
            const result = 
            await db.deleteFrom('entity_observation'

                ).where('user_id', '=', user_id
                ).where('entity_name', '=', entity_name
                ).where('observation', '=', observation
            ).execute();
            console.log("Entity observation deleted successfully:", result);
        }

        return { success: true};
    } catch (error) {
        console.error("Failed to delete entity observations:", error);
        return { success: false, error: error };
    }
}

export async function readGraph(hyperdrive: Hyperdrive, user_id: string) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })
          
        const db = new Kysely<Database>({
            dialect,
        })

 

        const entity_db = await db.selectFrom('entity').where('user_id', '=', user_id).selectAll().execute();
        const entity_observations_db = await db.selectFrom('entity_observation').where('user_id', '=', user_id).selectAll().execute();
        const relations_db = await db.selectFrom('relation').where('user_id', '=', user_id).selectAll().execute();

        console.log("Graph:", entity_db, entity_observations_db, relations_db);

        const entities: Entity[] = []
        entity_db.forEach(entity => {
            entities.push({
                name: entity.name,
                entityType: entity.type,
                observations: entity_observations_db.filter(observation => observation.entity_name === entity.name).map(observation => observation.observation),
            });
        });

        const relations: Relation[] = []
        relations_db.forEach(relation => {
            relations.push({
                from: relation.from,
                to: relation.to,
                relationType: relation.type,
            });
        });

        return { success: true, graph: { entities, relations } };
    } catch (error) {
        console.error("Failed to get memories:", error);
        return { success: false, error: error };
    }
}

export async function searchNodes(hyperdrive: Hyperdrive, user_id: string, search_query: string) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })

        const db = new Kysely<Database>({
            dialect,
        })

        const entityNamesResult = await db.selectFrom('entity').where('user_id', '=', user_id).where('name', 'ilike', `%${search_query}%`).selectAll().execute();
        const entityObservationsResult = await db.selectFrom('entity_observation').where('user_id', '=', user_id).where('observation', 'ilike', `%${search_query}%`).selectAll().execute();
        const entityTypesResult = await db.selectFrom('entity').where('user_id', '=', user_id).where('type', 'ilike', `%${search_query}%`).selectAll().execute();

        const entities: Entity[] = []
        entityNamesResult.forEach(entity => {
            entities.push({
                name: entity.name,
                entityType: entity.type,
                observations: entityObservationsResult.filter(observation => observation.entity_name === entity.name).map(observation => observation.observation),
            });
        });

        return { success: true, entityNamesResult, entityObservationsResult, entityTypesResult };
    } catch (error) {
        console.error("Failed to search nodes:", error);
        return { success: false, error: error };
    }
}

export async function openNodes(hyperdrive: Hyperdrive, user_id: string, node_names: string[] ) {
    try {
        const dialect = new PostgresDialect({
            pool: new Pool({
              connectionString: hyperdrive.connectionString,
              ssl: true
            })
          })

        const db = new Kysely<Database>({
            dialect,
        })

        const entities_db = await db.selectFrom('entity').where('user_id', '=', user_id).where('name', 'in', node_names).selectAll().execute();
        const entity_observations_db = await db.selectFrom('entity_observation').where('user_id', '=', user_id).where('entity_name', 'in', node_names).selectAll().execute();

        const entities: Entity[] = []
        entities_db.forEach(entity => {
            entities.push({
                name: entity.name,
                entityType: entity.type,
                observations: entity_observations_db.filter(observation => observation.entity_name === entity.name).map(observation => observation.observation),
            });
        });
        return { success: true, graph: {entities} };
          
    } catch (error) {
        console.error("Failed to open nodes:", error);
        return { success: false, error: error };
    }
}