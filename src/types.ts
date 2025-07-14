export interface User {
    id: string;
    email: string;
    tenantId: string;
    role: UserRole;
    permissions: string[];
    createdAt: Date;
    lastActiveAt: Date;
    isActive: boolean;
}

export interface Tenant {
    id: string;
    name: string;
    ownerId: string;
    settings: TenantSettings;
    toolConfig: ToolConfiguration;
    createdAt: Date;
    isActive: boolean;
}

export interface TenantSettings {
    maxUsers: number;
    allowedDomains: string[];
    sessionTimeoutMinutes: number;
    requireMFA: boolean;
}

export interface ToolConfiguration {
    [toolName: string]: ToolPermission;
}

export interface ToolPermission {
    enabled: boolean;
    allowedRoles: UserRole[];
    rateLimits: RateLimit;
    customConfig?: Record<string, any>;
}

export interface RateLimit {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
}

export type UserRole = "admin" | "user" | "readonly";

export interface UserContext {
    user: User;
    tenant: Tenant;
    sessionId: string;
    permissions: Set<string>;
}

export interface AuthTokenPayload {
    userId: string;
    tenantId: string;
    sessionId: string;
    scope: string[];
    exp: number;
    iat: number;
}

export interface McpRequestContext {
    user: UserContext;
    requestId: string;
    timestamp: Date;
}