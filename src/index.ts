import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

import { AuthkitHandler } from "./authkit-handler";
import { Props } from "./props";
import { testDatabaseConnection, createUsersCollection } from "./db";

export class MyMCP extends McpAgent<Env, unknown, Props> {

	server = new McpServer({
		name: "Multi-Tenant MCP Server",
		version: "1.0.0",
	});

	/**
	 * Initialize MCP server with user context
	 */
	async init() {

		
		// Register tools with user context awareness
		this.registerTools();
		const result = await testDatabaseConnection(this.env.HYPERDRIVE);
		//const result2 = await createUsersCollection(this.env.HYPERDRIVE);
		console.log("Database connection result:", result);
		//console.log("Database connection result:", result2);
	}

	/**
	 * Register all available tools with proper authorization
	 */
	private registerTools() {
		// Add tool - basic math operation
		if (this.canAccessTool("add")) {
			this.server.tool(
				"add", 
				{ 
					a: z.number().describe("First number to add"),
					b: z.number().describe("Second number to add")
				}, 
				async ({ a, b }) => {
					return {
						content: [{ 
							type: "text", 
							text: `Result: ${a + b}` 
						}]
					};
				}
			);
		}

		// Database test tool
		if (this.canAccessTool("test_db")) {
			this.server.tool(
				"test_db",
				{},
				async () => {
					const result = await testDatabaseConnection(this.env.HYPERDRIVE);
					return {
						content: [{
							type: "text",
							text: `Database test result: ${JSON.stringify(result, null, 2)}`
						}]
					};
				}
			);
		}

		// Create users collection tool
		if (this.canAccessTool("create_users_collection")) {
			this.server.tool(
				"create_users_collection",
				{},
				async () => {
					const result = await createUsersCollection(this.env.HYPERDRIVE);
					return {
						content: [{
							type: "text",
							text: `Create collection result: ${JSON.stringify(result, null, 2)}`
						}]
					};
				}
			);
		}
	}

	/**
	 * Check if current user can access a specific tool
	 */
	private canAccessTool(toolName: string): boolean {
		console.info("Checking permissions", this.props.permissions, toolName);
		console.info("Checking prop", this.props);
		if (this.props.permissions.includes(toolName)) {
			return true;
		}

		return false;
	}
}

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// @ts-expect-error - OAuth provider types need updating
	apiHandler: MyMCP.mount("/sse"),
	defaultHandler: AuthkitHandler as any,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
