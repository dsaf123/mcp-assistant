import type { Context, Next } from "hono";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { User, Tenant, UserContext, AuthTokenPayload } from "./types";
import type { Bindings } from "./app";

export class AuthError extends Error {
    constructor(
        message: string,
        public statusCode: number = 401,
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export class AuthService {
    constructor(
        private oauthProvider: OAuthHelpers,
        private env: Bindings,
    ) {}

    /**
     * Extract Bearer token from Authorization header
     */
    extractBearerToken(authHeader: string | undefined): string | null {
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return null;
        }
        return authHeader.substring(7);
    }

    /**
     * Validate OAuth token and extract user information
     */
    async validateToken(token: string): Promise<AuthTokenPayload> {
        try {
            // Use the OAuth provider to validate the token
            // @ts-expect-error - OAuth provider types need updating for validateAccessToken
            const tokenData = await this.oauthProvider.validateAccessToken(token);
            
            if (!tokenData || !tokenData.userId) {
                throw new AuthError("Invalid token", 401);
            }

            // Extract additional information from token
            const payload: AuthTokenPayload = {
                userId: tokenData.userId,
                tenantId: tokenData.props?.tenantId || tokenData.userId, // Default to userId if no tenant
                sessionId: tokenData.props?.sessionId || crypto.randomUUID(),
                scope: tokenData.scope ? tokenData.scope.split(" ") : [],
                exp: tokenData.exp || Math.floor(Date.now() / 1000) + 3600,
                iat: tokenData.iat || Math.floor(Date.now() / 1000),
            };

            return payload;
        } catch (error) {
            throw new AuthError("Token validation failed", 401);
        }
    }

    /**
     * Load user information from storage
     */
    async loadUser(userId: string): Promise<User> {
        const userKey = `user:${userId}`;
        const userData = await this.env.OAUTH_KV.get(userKey);
        
        if (!userData) {
            // Create default user if not exists (for first-time users)
            const defaultUser: User = {
                id: userId,
                email: userId, // Will be updated when we have actual email
                tenantId: userId, // Default to single-user tenant
                role: "user",
                permissions: ["read_profile", "read_data", "write_data"],
                createdAt: new Date(),
                lastActiveAt: new Date(),
                isActive: true,
            };
            
            await this.env.OAUTH_KV.put(userKey, JSON.stringify(defaultUser));
            return defaultUser;
        }

        return JSON.parse(userData) as User;
    }

    /**
     * Load tenant information from storage
     */
    async loadTenant(tenantId: string): Promise<Tenant> {
        const tenantKey = `tenant:${tenantId}`;
        const tenantData = await this.env.OAUTH_KV.get(tenantKey);
        
        if (!tenantData) {
            // Create default tenant if not exists
            const defaultTenant: Tenant = {
                id: tenantId,
                name: `Tenant ${tenantId}`,
                ownerId: tenantId,
                settings: {
                    maxUsers: 10,
                    allowedDomains: [],
                    sessionTimeoutMinutes: 60,
                    requireMFA: false,
                },
                toolConfig: {
                    add: {
                        enabled: true,
                        allowedRoles: ["admin", "user"],
                        rateLimits: {
                            requestsPerMinute: 60,
                            requestsPerHour: 1000,
                            requestsPerDay: 10000,
                        },
                    },
                },
                createdAt: new Date(),
                isActive: true,
            };
            
            await this.env.OAUTH_KV.put(tenantKey, JSON.stringify(defaultTenant));
            return defaultTenant;
        }

        return JSON.parse(tenantData) as Tenant;
    }

    /**
     * Create user context from validated token
     */
    async createUserContext(tokenPayload: AuthTokenPayload): Promise<UserContext> {
        const [user, tenant] = await Promise.all([
            this.loadUser(tokenPayload.userId),
            this.loadTenant(tokenPayload.tenantId),
        ]);

        // Update last active time
        user.lastActiveAt = new Date();
        await this.env.OAUTH_KV.put(`user:${user.id}`, JSON.stringify(user));

        return {
            user,
            tenant,
            sessionId: tokenPayload.sessionId,
            permissions: new Set(user.permissions),
        };
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(userContext: UserContext, permission: string): boolean {
        return userContext.permissions.has(permission) || 
               userContext.user.role === "admin";
    }

    /**
     * Check if user can access specific tool
     */
    canAccessTool(userContext: UserContext, toolName: string): boolean {
        const toolConfig = userContext.tenant.toolConfig[toolName];
        
        if (!toolConfig || !toolConfig.enabled) {
            return false;
        }

        return toolConfig.allowedRoles.includes(userContext.user.role) ||
               userContext.user.role === "admin";
    }
}

/**
 * Authentication middleware for Hono
 */
export function createAuthMiddleware() {
    return async (c: any, next: any) => {
        try {
            const authService = new AuthService(c.env.OAUTH_PROVIDER, c.env);
            
            // Extract token from Authorization header
            const authHeader = c.req.header("authorization");
            const token = authService.extractBearerToken(authHeader);
            
            if (!token) {
                throw new AuthError("Missing or invalid authorization header", 401);
            }

            // Validate token and create user context
            const tokenPayload = await authService.validateToken(token);
            const userContext = await authService.createUserContext(tokenPayload);

            // Store user context in Hono context
            c.set("userContext", userContext);
            c.set("authService", authService);

            await next();
        } catch (error) {
            if (error instanceof AuthError) {
                return c.json({ error: error.message }, error.statusCode as any);
            }
            
            console.error("Authentication error:", error);
            return c.json({ error: "Authentication failed" }, 401 as any);
        }
    };
}