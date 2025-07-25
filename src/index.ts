import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

import { AuthkitHandler } from "./authkit-handler";
import { Props } from "./props";
import { testDatabaseConnection, createUsersCollection, add_observations, readGraph, createEntities, createRelations, deleteEntities, deleteRelations, deleteObservations, searchNodes, openNodes } from "./db";
import { sendEmail } from "./email";
import { Resend } from "resend";

export class MyMCP extends McpAgent<Env, unknown, Props> {

	server = new McpServer({
		name: "Multi-Tenant MCP Server",
		version: "1.0.0",
	});

	resend: Resend = new Resend(this.env.RESEND_API_KEY);

	/**
	 * Initialize MCP server with user context
	 */
	async init() {
		const result = await testDatabaseConnection(this.env.HYPERDRIVE);
		console.log("Database connection result:", result);
		
		// Register tools with user context awareness
		this.registerTools();
		
	}

	/**
	 * Register all available tools with proper authorization
	 */
	private registerTools() {
		this.server.tool(
			"add_observations", 
			"Add new observations to existing entities in the knowledge graph",
			{ 
				entity_name: z.string().describe("Entity name"),
				observations: z.array(z.string()).describe("Observations to add")
			}, 
			async ({ entity_name, observations }) => {
				console.info("Checking permissions", this.props.user);
				const result = await add_observations(this.env.HYPERDRIVE, this.props.user.id, entity_name, observations);
				return {
					content: [{ 
						type: "text", 
						text: `Observations added: ${JSON.stringify(result, null, 2)}` 
					}]
				};
			}
		);

		this.server.tool(
			"test_database_connection", 
			"Test the connection to the knowledge graph database",
			{ 
		
			}, 
			async ({  }) => {
				console.info("Checking permissions", this.props.user);
				const result = await testDatabaseConnection(this.env.HYPERDRIVE);
				return {
					content: [{ 
						type: "text", 
						text: `Database connection result: ${JSON.stringify(result, null, 2)}` 
					}]
				};
			}
		);


		this.server.tool(
			"create_entities", 
			"Create multiple new entities in the knowledge graph",
			{
				entities: z.array(z.object({
					name: z.string().describe("The name of the entity"),
					entityType: z.string().describe("The type of the entity"),
					observations: z.array(z.string()).describe("An array of observation contents associated with the entity")
				})).describe("Create multiple new entities in the knowledge graph")
			},
			async ({ entities }) => {
				console.info("User ID running create_entities", this.props.user.id);
				const result = await createEntities(this.env.HYPERDRIVE, this.props.user.id, entities);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"read_graph", 
			"Read the entire knowledge graph",
			{},
			async ({ }) => {
				console.info("Checking permissions", this.props.user);
				const result = await readGraph(this.env.HYPERDRIVE, this.props.user.id);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result.graph, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"create_relations",
			"Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
			{
				relations: z.array(z.object({
					from: z.string().describe("The name of the entity where the relation starts"),
					to: z.string().describe("The name of the entity where the relation ends"),
					relationType: z.string().describe("The type of the relation")
				})).describe("Create multiple new relations between entities in the knowledge graph. Relations should be in active voice")
			},
			async ({ relations }) => {
				console.info("User ID running create_relations", this.props.user.id);
				const result = await createRelations(this.env.HYPERDRIVE, this.props.user.id, relations);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"delete_entities", 
			"Delete multiple entities and their associated relations from the knowledge graph",
			{
				entity_names: z.array(z.string()).describe("The names of the entities to delete")
			},
			async ({ entity_names }) => {
				console.info("User ID running delete_entities", this.props.user.id);
				const result = await deleteEntities(this.env.HYPERDRIVE, this.props.user.id, entity_names);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"delete_relations",
			"Delete multiple relations from the knowledge graph",
			{
				relations: z.array(z.object({
					from: z.string().describe("The name of the entity where the relation starts"),
					to: z.string().describe("The name of the entity where the relation ends"),
					relationType: z.string().describe("The type of the relation")
				})).describe("Delete multiple relations between entities in the knowledge graph")
			},
			async ({ relations }) => {
				console.info("User ID running delete_relations", this.props.user.id);
				const result = await deleteRelations(this.env.HYPERDRIVE, this.props.user.id, relations);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"delete_observations",
			"Delete specific observations from entities in the knowledge graph",
			{
				entity_name: z.string().describe("The name of the entity"),
				observations: z.array(z.string()).describe("The observations to delete")
			},
			async ({ entity_name, observations }) => {
				console.info("User ID running delete_observations", this.props.user.id);
				const result = await deleteObservations(this.env.HYPERDRIVE, this.props.user.id, entity_name, observations);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"search_nodes",
			"Search for nodes in the knowledge graph based on a query",
			{
				query: z.string().describe("The search query to match against entity names, types, and observation content")
			},
			async ({ query }) => {
				console.info("User ID running search_nodes", this.props.user.id);
				const result = await searchNodes(this.env.HYPERDRIVE, this.props.user.id, query);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result, null, 2)
					}]
				};
			}
		);

		this.server.tool(
			"open_nodes",
			"Open specific nodes in the knowledge graph by their names",
			{
				names: z.array(z.string()).describe("An array of entity names to retrieve")
			},
			async ({ names }) => {
				console.info("User ID running open_nodes", this.props.user.id);
				const result = await openNodes(this.env.HYPERDRIVE, this.props.user.id, names);
				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify(result.graph, null, 2)
					}]
				};	
			}
		);

		this.server.tool(
			"send_email", 
			"Send an email to the user's predefined email address",
			{ 
				subject: z.string().describe("Email subject line"),
				text: z.string().describe("Plain text email content"),
				html: z.string().optional().describe("HTML email content. When provided, the plain text argument MUST be provided as well.")
			}, 
			async ({ subject, text, html }) => {
				console.info("Checking permissions", this.props.user);
				const result = await sendEmail(this.resend, this.env.RESEND_FROM_EMAIL, this.props.user.email, subject, text, html);
				return {
					content: [{ 
						type: "text", 
						text: `Email sent successfully: ${JSON.stringify(result, null, 2)}` 
					}]
				};
			}
		);

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
