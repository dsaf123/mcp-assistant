import type { User, Tenant } from "./types";
import type { Bindings } from "./app";
import { z } from "zod";

export class UserService {
    constructor(private env: Bindings) {}

    /**
     * Validate user credentials against stored user data
     */
    async validateCredentials(email: string, password: string): Promise<User | null> {
        const userKey = `user:${email}`;
        const userData = await this.env.OAUTH_KV.get(userKey);
        
        if (!userData) {
            return null;
        }

        const user = JSON.parse(userData) as User & { passwordHash?: string };
        
        // In a real implementation, you'd hash the password and compare
        // For now, we'll implement a simple validation system
        if (!user.passwordHash) {
            return null;
        }

        // Simple password validation (in production, use proper hashing like bcrypt)
        const isValid = await this.verifyPassword(password, user.passwordHash);
        
        if (!isValid) {
            return null;
        }

        // Remove password hash from returned user object
        const { passwordHash, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Create a new user account
     */
    async createUser(email: string, password: string, tenantId?: string): Promise<User> {
        const userId = crypto.randomUUID();
        const finalTenantId = tenantId || userId; // Default to single-user tenant
        
        // Hash password (simple implementation - use bcrypt in production)
        const hashedPassword = await this.hashPassword(password);
        
        const user: User & { passwordHash: string } = {
            id: userId,
            email,
            tenantId: finalTenantId,
            role: "user",
            permissions: ["read_profile", "read_data", "write_data"],
            createdAt: new Date(),
            lastActiveAt: new Date(),
            isActive: true,
            passwordHash: hashedPassword
        };

        // Store user data
        const userKey = `user:${email}`;
        await this.env.OAUTH_KV.put(userKey, JSON.stringify(user));
        
        // Also store by user ID for quick lookups
        const userByIdKey = `user-by-id:${userId}`;
        await this.env.OAUTH_KV.put(userByIdKey, JSON.stringify(user));

        // Create default tenant if it doesn't exist
        await this.ensureTenantExists(finalTenantId, userId);

        // Remove password hash from returned user object
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Get user by email
     */
    async getUserByEmail(email: string): Promise<User | null> {
        const userKey = `user:${email}`;
        const userData = await this.env.OAUTH_KV.get(userKey);
        
        if (!userData) {
            return null;
        }

        const user = JSON.parse(userData) as User & { passwordHash?: string };
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<User | null> {
        const userKey = `user-by-id:${userId}`;
        const userData = await this.env.OAUTH_KV.get(userKey);
        
        if (!userData) {
            return null;
        }

        const user = JSON.parse(userData) as User & { passwordHash?: string };
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Update user's last active time
     */
    async updateLastActive(userId: string): Promise<void> {
        const user = await this.getUserById(userId);
        if (!user) return;

        user.lastActiveAt = new Date();
        
        // Update both email and ID keys
        const userKey = `user:${user.email}`;
        const userByIdKey = `user-by-id:${userId}`;
        
        await Promise.all([
            this.env.OAUTH_KV.put(userKey, JSON.stringify(user)),
            this.env.OAUTH_KV.put(userByIdKey, JSON.stringify(user))
        ]);
    }

    /**
     * Ensure tenant exists, create if not
     */
    private async ensureTenantExists(tenantId: string, ownerId: string): Promise<void> {
        const tenantKey = `tenant:${tenantId}`;
        const existingTenant = await this.env.OAUTH_KV.get(tenantKey);
        
        if (existingTenant) {
            return;
        }

        const tenant: Tenant = {
            id: tenantId,
            name: `Tenant ${tenantId}`,
            ownerId,
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
                calculate: {
                    enabled: true,
                    allowedRoles: ["admin", "user"],
                    rateLimits: {
                        requestsPerMinute: 30,
                        requestsPerHour: 500,
                        requestsPerDay: 5000,
                    },
                },
                get_user_info: {
                    enabled: true,
                    allowedRoles: ["admin", "user", "readonly"],
                    rateLimits: {
                        requestsPerMinute: 10,
                        requestsPerHour: 100,
                        requestsPerDay: 1000,
                    },
                },
            },
            createdAt: new Date(),
            isActive: true,
        };

        await this.env.OAUTH_KV.put(tenantKey, JSON.stringify(tenant));
    }

    /**
     * Simple password hashing (use bcrypt in production)
     */
    private async hashPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + "mcp-server-salt"); // Add salt
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Verify password against hash
     */
    private async verifyPassword(password: string, hash: string): Promise<boolean> {
        const computedHash = await this.hashPassword(password);
        return computedHash === hash;
    }

    /**
     * Check if email is valid format
     */
    static isValidEmail(email: string): boolean {
        const emailSchema = z.string().email();
        return emailSchema.safeParse(email).success;
    }

    /**
     * Check if password meets requirements
     */
    static isValidPassword(password: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        
        if (password.length < 8) {
            errors.push("Password must be at least 8 characters long");
        }
        
        if (!/[A-Z]/.test(password)) {
            errors.push("Password must contain at least one uppercase letter");
        }
        
        if (!/[a-z]/.test(password)) {
            errors.push("Password must contain at least one lowercase letter");
        }
        
        if (!/[0-9]/.test(password)) {
            errors.push("Password must contain at least one number");
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
}