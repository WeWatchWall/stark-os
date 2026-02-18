declare module '@stark-o/browser-runtime' {
  export function createBrowserAgent(config: unknown): {
    start(): Promise<void>;
    stop(): Promise<void>;
  };
  export function loadBrowserCredentials(): {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId: string;
  } | null;
  export function saveBrowserCredentials(creds: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    userId: string;
  }): void;
  export function getBrowserAccessToken(): string | null;
}
