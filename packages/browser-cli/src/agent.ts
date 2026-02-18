/**
 * Browser CLI Agent
 *
 * Hooks into the browser runtime to create a node,
 * mirroring the Node.js CLI `node agent start` functionality.
 * @module @stark-o/browser-cli/agent
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Options for starting a browser agent
 */
export interface BrowserAgentStartOptions {
  /** Orchestrator WebSocket URL */
  url: string;
  /** Node name */
  name: string;
  /** Authentication token (optional if browser credentials exist) */
  token?: string;
  /** Node labels */
  labels?: Record<string, string>;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Debug mode */
  debug?: boolean;
}

/**
 * Browser node credentials
 */
export interface BrowserNodeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

/**
 * Start a browser node agent.
 * This hooks into the browser runtime and creates another node
 * just like the Node.js version does.
 *
 * Dynamically imports @stark-o/browser-runtime to avoid build issues.
 *
 * @returns The created BrowserAgent instance
 */
export async function startBrowserAgent(options: BrowserAgentStartOptions): Promise<any> {
  // Dynamic import to avoid TypeScript declaration issues
  const browserRuntime = await import('@stark-o/browser-runtime');

  // Resolve authentication
  let authToken = options.token;

  if (!authToken) {
    // Try using existing browser credentials
    const browserToken = browserRuntime.getBrowserAccessToken();
    if (browserToken) {
      authToken = browserToken;
    }
  }

  if (!authToken) {
    throw new Error('Authentication required. Please provide a token or login first.');
  }

  const agentConfig = {
    orchestratorUrl: options.url,
    authToken,
    nodeName: options.name,
    autoRegister: true,
    heartbeatInterval: options.heartbeatInterval ?? 15000,
    debug: options.debug ?? false,
    persistState: true,
    resumeExisting: true,
  };

  const agent = browserRuntime.createBrowserAgent(agentConfig);
  await agent.start();

  return agent;
}

/**
 * Store browser agent credentials
 */
export async function storeBrowserCredentials(creds: BrowserNodeCredentials): Promise<void> {
  const browserRuntime = await import('@stark-o/browser-runtime');
  browserRuntime.saveBrowserCredentials(creds);
}

/**
 * Load stored browser agent credentials
 */
export async function getBrowserCredentials(): Promise<BrowserNodeCredentials | null> {
  const browserRuntime = await import('@stark-o/browser-runtime');
  return browserRuntime.loadBrowserCredentials();
}
