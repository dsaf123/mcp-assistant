import { Hono } from "hono";
import {
	layout,
	homeContent,
	parseApproveFormBody,
	renderAuthorizationRejectedContent,
	renderAuthorizationApprovedContent,
	renderLoggedInAuthorizeScreen,
	renderLoggedOutAuthorizeScreen,
} from "./utils";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { UserService } from "./user-service";
import { createAuthMiddleware, AuthService } from "./auth";
import { UserContext } from "./types";
import adminApp from "./admin-routes";

export type Bindings = Env & {
	OAUTH_PROVIDER: OAuthHelpers;
};

type HonoContext = {
	Bindings: Bindings;
	Variables: {
		userContext?: UserContext;
		authService?: AuthService;
	};
};

const app = new Hono<HonoContext>();

// Apply authentication middleware to protected routes
app.use("/api/*", createAuthMiddleware());

// Mount admin routes
app.route("/api/admin", adminApp);

// Render a basic homepage placeholder to make sure the app is up
app.get("/", async (c) => {
	const content = await homeContent(c.req.raw);
	return c.html(layout(content, "MCP Remote Auth Demo - Home"));
});

// Render an authorization page
// Check if user has an active session, otherwise show login form
app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);

	const oauthScopes = [
		{
			name: "read_profile",
			description: "Read your basic profile information",
		},
		{ name: "read_data", description: "Access your stored data" },
		{ name: "write_data", description: "Create and modify your data" },
	];

	// Check if user is already logged in via session cookie or token
	const sessionToken = c.req.header("authorization");
	let isLoggedIn = false;
	let userEmail = "";

	if (sessionToken) {
		try {
			// Try to validate existing session
			const userService = new UserService(c.env);
			// In a full implementation, you'd have session management
			// For now, we'll show the logged-out flow by default
			isLoggedIn = false;
		} catch (error) {
			isLoggedIn = false;
		}
	}

	if (isLoggedIn) {
		const content = await renderLoggedInAuthorizeScreen(oauthScopes, oauthReqInfo);
		return c.html(layout(content, "MCP Multi-Tenant Server - Authorization"));
	}

	const content = await renderLoggedOutAuthorizeScreen(oauthScopes, oauthReqInfo);
	return c.html(layout(content, "MCP Multi-Tenant Server - Authorization"));
});

// The /authorize page has a form that will POST to /approve
// This endpoint validates login credentials and completes OAuth authorization
app.post("/approve", async (c) => {
	const { action, oauthReqInfo, email, password } = await parseApproveFormBody(
		await c.req.parseBody(),
	);

	if (!oauthReqInfo) {
		return c.html("INVALID OAuth REQUEST", 400);
	}

	let user = null;
	const userService = new UserService(c.env);

	// Handle different approval actions
	if (action === "login_approve") {
		// Validate email format
		if (!UserService.isValidEmail(email)) {
			return c.html(
				layout(
					await renderAuthorizationRejectedContent("/", "Invalid email format"),
					"MCP Multi-Tenant Server - Authorization Failed",
				),
			);
		}

		// Validate password requirements
		const passwordValidation = UserService.isValidPassword(password);
		if (!passwordValidation.valid) {
			return c.html(
				layout(
					await renderAuthorizationRejectedContent("/", `Password requirements not met: ${passwordValidation.errors.join(", ")}`),
					"MCP Multi-Tenant Server - Authorization Failed",
				),
			);
		}

		// Try to authenticate user
		user = await userService.validateCredentials(email, password);
		
		if (!user) {
			// Check if user exists, if not create them
			const existingUser = await userService.getUserByEmail(email);
			if (!existingUser) {
				try {
					user = await userService.createUser(email, password);
				} catch (error) {
					return c.html(
						layout(
							await renderAuthorizationRejectedContent("/", "Failed to create user account"),
							"MCP Multi-Tenant Server - Authorization Failed",
						),
					);
				}
			} else {
				return c.html(
					layout(
						await renderAuthorizationRejectedContent("/", "Invalid credentials"),
						"MCP Multi-Tenant Server - Authorization Failed",
					),
				);
			}
		}
	} else if (action === "approve") {
		// User is already logged in, just approving scopes
		// In a real implementation, you'd validate the existing session
		return c.html(
			layout(
				await renderAuthorizationRejectedContent("/", "Session validation not implemented"),
				"MCP Multi-Tenant Server - Authorization Failed",
			),
		);
	} else if (action === "reject") {
		// User rejected the authorization
		return c.html(
			layout(
				await renderAuthorizationRejectedContent("/", "Authorization rejected by user"),
				"MCP Multi-Tenant Server - Authorization Rejected",
			),
		);
	}

	if (!user) {
		return c.html(
			layout(
				await renderAuthorizationRejectedContent("/", "Authentication failed"),
				"MCP Multi-Tenant Server - Authorization Failed",
			),
		);
	}

	// Update user's last active time
	await userService.updateLastActive(user.id);

	// Complete the OAuth authorization with user information
	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		request: oauthReqInfo,
		userId: user.id,
		metadata: {
			label: user.email,
			role: user.role,
		},
		scope: oauthReqInfo.scope,
		props: {
			userEmail: user.email,
			tenantId: user.tenantId,
			sessionId: crypto.randomUUID(),
		},
	});

	return c.html(
		layout(
			await renderAuthorizationApprovedContent(redirectTo),
			"MCP Multi-Tenant Server - Authorization Approved",
		),
	);
});

// User registration endpoint
app.post("/register", async (c) => {
	try {
		const body = await c.req.parseBody();
		const email = body.email as string;
		const password = body.password as string;
		const confirmPassword = body.confirmPassword as string;

		// Validate inputs
		if (!email || !password || !confirmPassword) {
			return c.json({ error: "Missing required fields" }, 400);
		}

		if (password !== confirmPassword) {
			return c.json({ error: "Passwords do not match" }, 400);
		}

		if (!UserService.isValidEmail(email)) {
			return c.json({ error: "Invalid email format" }, 400);
		}

		const passwordValidation = UserService.isValidPassword(password);
		if (!passwordValidation.valid) {
			return c.json({ error: passwordValidation.errors }, 400);
		}

		const userService = new UserService(c.env);
		
		// Check if user already exists
		const existingUser = await userService.getUserByEmail(email);
		if (existingUser) {
			return c.json({ error: "User already exists" }, 409);
		}

		// Create new user
		const user = await userService.createUser(email, password);
		
		return c.json({ 
			message: "User created successfully",
			userId: user.id,
			email: user.email
		});
	} catch (error) {
		console.error("Registration error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// Protected API endpoint example
app.get("/api/user/profile", async (c) => {
	const userContext = c.get("userContext") as UserContext;
	return c.json({
		user: {
			id: userContext.user.id,
			email: userContext.user.email,
			role: userContext.user.role,
			tenantId: userContext.tenant.id,
			tenantName: userContext.tenant.name,
		},
	});
});

export default app;
