import { MyMCP } from "./index";
import { AuthService } from "./auth";
import type { UserContext } from "./types";
import type { Bindings } from "./app";

/**
 * Factory for creating user-scoped MCP instances
 */
export class McpFactory {
    private static instances = new Map<string, MyMCP>();

    /**
     * Get or create a user-scoped MCP instance
     * Uses user ID to ensure each user gets their own isolated instance
     */
    static async getInstanceForUser(
        userContext: UserContext,
        authService: AuthService
    ): Promise<MyMCP> {
        const instanceKey = `${userContext.tenant.id}:${userContext.user.id}`;
        
        // Check if we already have an instance for this user
        let instance = this.instances.get(instanceKey);
        
        if (!instance) {
            // Create new user-scoped instance
            instance = await MyMCP.createForUser(userContext, authService);
            this.instances.set(instanceKey, instance);
        }
        
        return instance;
    }

    /**
     * Remove instance from cache (useful for user logout or cleanup)
     */
    static removeInstance(tenantId: string, userId: string): void {
        const instanceKey = `${tenantId}:${userId}`;
        this.instances.delete(instanceKey);
    }

    /**
     * Get Durable Object name for user-scoped MCP instances
     * This ensures each user gets their own DO instance for isolation
     */
    static getDurableObjectName(tenantId: string, userId: string): string {
        return `mcp-agent-${tenantId}-${userId}`;
    }

    /**
     * Clear all instances (useful for testing or memory management)
     */
    static clearAllInstances(): void {
        this.instances.clear();
    }
}

/**
 * User-aware MCP Agent Durable Object
 * This extends the base MyMCP class to work with Cloudflare Durable Objects
 */
export class UserMcpAgent extends MyMCP {
    protected env?: Bindings;

    constructor(state: DurableObjectState, env: Bindings) {
        super();
        this.env = env;
    }

    /**
     * Handle incoming MCP requests with user authentication
     */
    async fetch(request: Request): Promise<Response> {
        try {
            // Extract user context from request headers or token
            const authService = new AuthService(this.env!.OAUTH_PROVIDER, this.env!);
            
            // Get authorization header
            const authHeader = request.headers.get("authorization");
            const token = authService.extractBearerToken(authHeader || undefined);
            
            if (!token) {
                return new Response("Unauthorized", { status: 401 });
            }

            // Validate token and get user context
            const tokenPayload = await authService.validateToken(token);
            const userContext = await authService.createUserContext(tokenPayload);

            // Initialize this instance with user context if not already done
            if (!this.getUserContext()) {
                await this.init(userContext, authService);
            }

            // Create a new request with user context for the MCP handler
            const mcpRequest = new Request(request.url, {
                method: request.method,
                headers: request.headers,
                body: request.body,
            });

            // Use the parent MCP agent to handle the request
            return await super.fetch(mcpRequest);
        } catch (error) {
            console.error("MCP Agent error:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    }

    /**
     * Enhanced log tool usage with KV storage
     */
    public async logToolUsage(toolName: string, params: any): Promise<void> {
        const userContext = this.getUserContext();
        if (!userContext || !this.env) return;

        const logEntry = {
            userId: userContext.user.id,
            tenantId: userContext.tenant.id,
            toolName,
            params,
            timestamp: new Date().toISOString(),
            sessionId: userContext.sessionId
        };

        // Store in tenant-scoped audit log with TTL (30 days)
        const logKey = `audit:${userContext.tenant.id}:${Date.now()}:${crypto.randomUUID()}`;
        const ttl = 30 * 24 * 60 * 60; // 30 days in seconds
        
        try {
            await this.env.OAUTH_KV.put(logKey, JSON.stringify(logEntry), {
                expirationTtl: ttl
            });
        } catch (error) {
            console.error("Failed to log tool usage to KV:", error);
        }
    }

    /**
     * Get user-specific data from KV storage
     */
    protected async getUserData(key: string): Promise<any> {
        const userContext = this.getUserContext();
        if (!userContext || !this.env) return null;
        
        const fullKey = `user-data:${userContext.tenant.id}:${userContext.user.id}:${key}`;
        const data = await this.env.OAUTH_KV.get(fullKey);
        
        return data ? JSON.parse(data) : null;
    }

    /**
     * Store user-specific data in KV storage
     */
    protected async setUserData(key: string, value: any, ttl?: number): Promise<void> {
        const userContext = this.getUserContext();
        if (!userContext || !this.env) return;
        
        const fullKey = `user-data:${userContext.tenant.id}:${userContext.user.id}:${key}`;
        const options = ttl ? { expirationTtl: ttl } : undefined;
        
        await this.env.OAUTH_KV.put(fullKey, JSON.stringify(value), options);
    }
}