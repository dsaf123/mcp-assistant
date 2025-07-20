import { Client, ClientConfig } from 'pg';

export async function testDatabaseConnection(hyperdrive: Hyperdrive) {
    try {
        // Test basic connection with MongoDB

        const sql = new Client({
            connectionString: hyperdrive.connectionString,
            ssl: true
        });

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
        const db = await sql.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY, 
            email VARCHAR(255) NOT NULL, 
            name VARCHAR(255) NOT NULL, 
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
        console.log("Users table created successfully:", db);
        // const users = db.collection("users");
        // await users.createIndex({ email: 1 }, { unique: true });

        console.log("Users collection created successfully");
        return { success: true };
    } catch (error) {
        console.error("Failed to create users collection:", error);
        return { success: false, error: error };
    }
}