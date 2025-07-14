import { Hono } from "hono";
import type { Bindings } from "./app";
import { UserService } from "./user-service";
import type { UserContext, Tenant, ToolConfiguration } from "./types";

type AdminContext = {
	Bindings: Bindings;
	Variables: {
		userContext?: UserContext;
	};
};

const adminApp = new Hono<AdminContext>();

/**
 * Middleware to ensure user is admin
 */
const requireAdmin = async (c: any, next: any) => {
    const userContext = c.get("userContext") as UserContext;
    
    if (userContext.user.role !== "admin") {
        return c.json({ error: "Admin access required" }, 403);
    }
    
    await next();
};

// Apply admin middleware to all admin routes
adminApp.use("*", requireAdmin);

// Get tenant configuration
adminApp.get("/tenant", async (c) => {
    const userContext = c.get("userContext") as UserContext;
    return c.json({ tenant: userContext.tenant });
});

// Update tenant configuration
adminApp.put("/tenant", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const updates = await c.req.json();
        
        // Validate updates
        const allowedFields = ["name", "settings", "toolConfig"] as const;
        const filteredUpdates: Partial<Tenant> = {};
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                (filteredUpdates as any)[field] = updates[field];
            }
        }
        
        // Update tenant
        const updatedTenant = { ...userContext.tenant, ...filteredUpdates };
        const tenantKey = `tenant:${userContext.tenant.id}`;
        await c.env.OAUTH_KV.put(tenantKey, JSON.stringify(updatedTenant));
        
        return c.json({ tenant: updatedTenant });
    } catch (error) {
        return c.json({ error: "Failed to update tenant" }, 500);
    }
});

// Get all users in tenant
adminApp.get("/users", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const userService = new UserService(c.env);
        
        // In a real implementation, you'd have a proper user listing mechanism
        // For now, we'll return basic info
        return c.json({
            users: [
                {
                    id: userContext.user.id,
                    email: userContext.user.email,
                    role: userContext.user.role,
                    isActive: userContext.user.isActive,
                    lastActiveAt: userContext.user.lastActiveAt
                }
            ],
            total: 1
        });
    } catch (error) {
        return c.json({ error: "Failed to get users" }, 500);
    }
});

// Update user role/permissions
adminApp.put("/users/:userId", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const userId = c.req.param("userId");
        const updates = await c.req.json();
        
        if (userId === userContext.user.id && updates.role && updates.role !== "admin") {
            return c.json({ error: "Cannot remove admin role from yourself" }, 400);
        }
        
        const userService = new UserService(c.env);
        const targetUser = await userService.getUserById(userId);
        
        if (!targetUser || targetUser.tenantId !== userContext.tenant.id) {
            return c.json({ error: "User not found" }, 404);
        }
        
        // Update allowed fields
        const allowedFields = ["role", "permissions", "isActive"] as const;
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                (targetUser as any)[field] = updates[field];
            }
        }
        
        // Save updated user
        const userKey = `user:${targetUser.email}`;
        const userByIdKey = `user-by-id:${userId}`;
        
        await Promise.all([
            c.env.OAUTH_KV.put(userKey, JSON.stringify(targetUser)),
            c.env.OAUTH_KV.put(userByIdKey, JSON.stringify(targetUser))
        ]);
        
        return c.json({ user: targetUser });
    } catch (error) {
        return c.json({ error: "Failed to update user" }, 500);
    }
});

// Get audit logs for tenant
adminApp.get("/audit-logs", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const limit = parseInt(c.req.query("limit") || "50");
        const offset = parseInt(c.req.query("offset") || "0");
        
        // Get audit logs for this tenant
        // In a real implementation, you'd use a proper database with indexing
        const logs: any[] = [];
        
        // For now, return empty array - in production you'd query KV with proper pagination
        return c.json({
            logs,
            total: 0,
            limit,
            offset
        });
    } catch (error) {
        return c.json({ error: "Failed to get audit logs" }, 500);
    }
});

// Get usage statistics
adminApp.get("/usage", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        
        // In a real implementation, you'd aggregate usage data
        const usage = {
            tenant: userContext.tenant.id,
            period: "last_30_days",
            toolUsage: {
                add: { requests: 150, errors: 2 },
                calculate: { requests: 75, errors: 1 },
                get_user_info: { requests: 25, errors: 0 }
            },
            users: {
                total: 1,
                active: 1,
                inactive: 0
            }
        };
        
        return c.json({ usage });
    } catch (error) {
        return c.json({ error: "Failed to get usage statistics" }, 500);
    }
});

// Configure tool permissions
adminApp.put("/tools/:toolName", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const toolName = c.req.param("toolName");
        const config = await c.req.json();
        
        // Validate tool configuration
        const validRoles = ["admin", "user", "readonly"];
        if (config.allowedRoles && !config.allowedRoles.every((role: string) => validRoles.includes(role))) {
            return c.json({ error: "Invalid role specified" }, 400);
        }
        
        // Update tenant tool configuration
        const updatedTenant = { ...userContext.tenant };
        updatedTenant.toolConfig[toolName] = {
            enabled: config.enabled !== undefined ? config.enabled : true,
            allowedRoles: config.allowedRoles || ["admin", "user"],
            rateLimits: config.rateLimits || {
                requestsPerMinute: 60,
                requestsPerHour: 1000,
                requestsPerDay: 10000
            },
            customConfig: config.customConfig || {}
        };
        
        const tenantKey = `tenant:${userContext.tenant.id}`;
        await c.env.OAUTH_KV.put(tenantKey, JSON.stringify(updatedTenant));
        
        return c.json({ 
            tool: toolName,
            config: updatedTenant.toolConfig[toolName]
        });
    } catch (error) {
        return c.json({ error: "Failed to update tool configuration" }, 500);
    }
});

// Delete/disable tool
adminApp.delete("/tools/:toolName", async (c) => {
    try {
        const userContext = c.get("userContext") as UserContext;
        const toolName = c.req.param("toolName");
        
        // Update tenant tool configuration
        const updatedTenant = { ...userContext.tenant };
        if (updatedTenant.toolConfig[toolName]) {
            updatedTenant.toolConfig[toolName].enabled = false;
        }
        
        const tenantKey = `tenant:${userContext.tenant.id}`;
        await c.env.OAUTH_KV.put(tenantKey, JSON.stringify(updatedTenant));
        
        return c.json({ message: `Tool ${toolName} disabled` });
    } catch (error) {
        return c.json({ error: "Failed to disable tool" }, 500);
    }
});

export default adminApp;