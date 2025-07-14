import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";

import { AuthkitHandler } from "./authkit-handler";
import { Props } from "./props";

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
