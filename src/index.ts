import app from "./app";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import type { UserContext, McpRequestContext } from "./types";
import { AuthService } from "./auth";

export class MyMCP extends McpAgent {
	private userContext?: UserContext;
	private authService?: AuthService;
	protected env?: any;
	
	server = new McpServer({
		name: "Multi-Tenant MCP Server",
		version: "1.0.0",
	});

	constructor(ctx?: DurableObjectState, env?: any) {
		if (ctx && env) {
			super(ctx, env);
			this.env = env;
		} else {
			// For standalone instances, create dummy state and env
			super({} as DurableObjectState, {} as any);
		}
	}

	/**
	 * Initialize MCP server with user context
	 */
	async init(userContext?: UserContext, authService?: AuthService) {
		this.userContext = userContext;
		this.authService = authService;
		
		// Register tools with user context awareness
		this.registerTools();
	}

	/**
	 * Register all available tools with proper authorization
	 */
	private registerTools() {
		// Add tool - basic math operation
		this.server.tool(
			"add", 
			{ 
				a: z.number().describe("First number to add"),
				b: z.number().describe("Second number to add")
			}, 
			async ({ a, b }) => {
				// Check if user can access this tool
				if (!this.canAccessTool("add")) {
					return {
						content: [{ 
							type: "text", 
							text: "Access denied: You don't have permission to use the add tool" 
						}],
						isError: true
					};
				}

				// Log tool usage for audit
				await this.logToolUsage("add", { a, b });

				return {
					content: [{ 
						type: "text", 
						text: `Result: ${a + b}` 
					}]
				};
			}
		);

		// Calculator tool - more advanced math operations
		this.server.tool(
			"calculate",
			{
				expression: z.string().describe("Mathematical expression to evaluate (e.g., '2 + 3 * 4')")
			},
			async ({ expression }) => {
				if (!this.canAccessTool("calculate")) {
					return {
						content: [{ 
							type: "text", 
							text: "Access denied: You don't have permission to use the calculate tool" 
						}],
						isError: true
					};
				}

				try {
					// Simple expression evaluator (safe for basic math)
					const result = this.evaluateExpression(expression);
					await this.logToolUsage("calculate", { expression, result });
					
					return {
						content: [{ 
							type: "text", 
							text: `Expression: ${expression}\nResult: ${result}` 
						}]
					};
				} catch (error) {
					return {
						content: [{ 
							type: "text", 
							text: `Error evaluating expression: ${error instanceof Error ? error.message : 'Unknown error'}` 
						}],
						isError: true
					};
				}
			}
		);

		// User info tool - get current user information
		this.server.tool(
			"get_user_info",
			{},
			async () => {
				if (!this.userContext) {
					return {
						content: [{ 
							type: "text", 
							text: "No user context available" 
						}],
						isError: true
					};
				}

				await this.logToolUsage("get_user_info", {});

				return {
					content: [{ 
						type: "text", 
						text: JSON.stringify({
							userId: this.userContext.user.id,
							email: this.userContext.user.email,
							role: this.userContext.user.role,
							tenantId: this.userContext.tenant.id,
							tenantName: this.userContext.tenant.name
						}, null, 2)
					}]
				};
			}
		);
	}

	/**
	 * Check if current user can access a specific tool
	 */
	private canAccessTool(toolName: string): boolean {
		if (!this.userContext || !this.authService) {
			return false;
		}

		return this.authService.canAccessTool(this.userContext, toolName);
	}

	/**
	 * Log tool usage for audit purposes
	 */
	protected async logToolUsage(toolName: string, params: any): Promise<void> {
		if (!this.userContext) return;

		const logEntry = {
			userId: this.userContext.user.id,
			tenantId: this.userContext.tenant.id,
			toolName,
			params,
			timestamp: new Date().toISOString(),
			sessionId: this.userContext.sessionId
		};

		// Store in tenant-scoped audit log
		const logKey = `audit:${this.userContext.tenant.id}:${Date.now()}:${crypto.randomUUID()}`;
		
		// Note: In a real implementation, you'd want to use a proper logging service
		// For now, we'll store in KV with a TTL
		try {
			// This would need access to KV storage - we'll implement this when we have the env context
			console.log("Tool usage:", logEntry);
		} catch (error) {
			console.error("Failed to log tool usage:", error);
		}
	}

	/**
	 * Safe expression evaluator for basic math
	 */
	private evaluateExpression(expression: string): number {
		// Remove any non-math characters for safety
		const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
		
		// Basic validation
		if (!sanitized.trim()) {
			throw new Error("Empty expression");
		}

		// Use Function constructor for evaluation (safer than eval)
		try {
			const result = Function(`"use strict"; return (${sanitized})`)();
			
			if (typeof result !== 'number' || !isFinite(result)) {
				throw new Error("Result is not a valid number");
			}
			
			return result;
		} catch (error) {
			throw new Error("Invalid mathematical expression");
		}
	}

	/**
	 * Create a user-scoped instance of MyMCP
	 */
	static async createForUser(userContext: UserContext, authService: AuthService): Promise<MyMCP> {
		const instance = new MyMCP();
		await instance.init(userContext, authService);
		return instance;
	}

	/**
	 * Make userContext and authService accessible to derived classes
	 */
	protected getUserContext(): UserContext | undefined {
		return this.userContext;
	}

	protected getAuthService(): AuthService | undefined {
		return this.authService;
	}

	/**
	 * Make logToolUsage accessible to derived classes
	 */
	protected async logToolUsageProtected(toolName: string, params: any, env?: any): Promise<void> {
		if (!this.userContext) return;

		const logEntry = {
			userId: this.userContext.user.id,
			tenantId: this.userContext.tenant.id,
			toolName,
			params,
			timestamp: new Date().toISOString(),
			sessionId: this.userContext.sessionId
		};

		const logKey = `audit:${this.userContext.tenant.id}:${Date.now()}:${crypto.randomUUID()}`;
		
		try {
			if (env?.OAUTH_KV) {
				await env.OAUTH_KV.put(logKey, JSON.stringify(logEntry), {
					expirationTtl: 30 * 24 * 60 * 60 // 30 days
				});
			}
			console.log("Tool usage:", logEntry);
		} catch (error) {
			console.error("Failed to log tool usage:", error);
		}
	}
}

// Export user-aware MCP agent for Durable Objects
export { UserMcpAgent } from "./mcp-factory";

// Create authenticated MCP handler that creates user-scoped instances
const createAuthenticatedMcpHandler = () => {
	return async (request: Request, env: any): Promise<Response> => {
		try {
			// This handler will be called by the OAuth provider for /sse requests
			// The OAuth provider has already validated the token and extracted user info
			
			// Create a UserMcpAgent instance for this request
			const durableObjectId = env.MCP_OBJECT.idFromName("singleton");
			const durableObject = env.MCP_OBJECT.get(durableObjectId);
			
			return await durableObject.fetch(request);
		} catch (error) {
			console.error("MCP handler error:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	};
};

// Export the OAuth handler as the default
export default new OAuthProvider({
	apiRoute: "/sse",
	// @ts-expect-error - OAuth provider types need updating
	apiHandler: createAuthenticatedMcpHandler(),
	// @ts-expect-error - OAuth provider types need updating  
	defaultHandler: app,
	authorizeEndpoint: "/authorize",
	tokenEndpoint: "/token",
	clientRegistrationEndpoint: "/register",
});
