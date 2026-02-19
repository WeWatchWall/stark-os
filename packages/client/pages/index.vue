<template>
  <div class="app-container">
    <!-- Login/Register Screen -->
    <div v-if="!isAuthenticated" class="auth-container">
      <div class="auth-card">
        <img src="~/assets/Logo.png" alt="StarkOS" class="logo" />

        <!-- Login Form -->
        <form v-if="authMode === 'login'" method="post" action="#" @submit.prevent="handleLogin" class="auth-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              name="email"
              v-model="email"
              type="email"
              placeholder="Enter your email"
              required
              autocomplete="username"
              :disabled="isLoading"
            />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              name="password"
              v-model="password"
              type="password"
              placeholder="Enter your password"
              required
              autocomplete="current-password"
              :disabled="isLoading"
            />
          </div>
          <div v-if="authError" class="error-message">{{ authError }}</div>
          <button type="submit" class="btn btn-primary" :disabled="isLoading">
            {{ isLoading ? 'Signing in...' : 'Sign In' }}
          </button>
          <button
            v-if="registrationEnabled"
            type="button"
            class="btn btn-secondary"
            @click="authMode = 'register'; authError = ''; confirmPassword = ''"
            :disabled="isLoading"
          >
            Create Account
          </button>
        </form>

        <!-- Register Form -->
        <form v-else method="post" action="#" @submit.prevent="handleRegister" class="auth-form">
          <div class="form-group">
            <label for="reg-email">Email</label>
            <input
              id="reg-email"
              name="email"
              v-model="email"
              type="email"
              placeholder="Enter your email"
              required
              autocomplete="username"
              :disabled="isLoading"
            />
          </div>
          <div class="form-group">
            <label for="reg-password">Password</label>
            <input
              id="reg-password"
              name="new-password"
              v-model="password"
              type="password"
              placeholder="Min 8 characters"
              required
              minlength="8"
              autocomplete="new-password"
              :disabled="isLoading"
            />
          </div>
          <div class="form-group">
            <label for="reg-confirm-password">Confirm Password</label>
            <input
              id="reg-confirm-password"
              name="confirm-password"
              v-model="confirmPassword"
              type="password"
              placeholder="Re-enter your password"
              required
              minlength="8"
              autocomplete="new-password"
              :disabled="isLoading"
            />
          </div>
          <div v-if="authError" class="error-message">{{ authError }}</div>
          <button type="submit" class="btn btn-primary" :disabled="isLoading">
            {{ isLoading ? 'Creating account...' : 'Create Account' }}
          </button>
          <button
            type="button"
            class="btn btn-secondary"
            @click="authMode = 'login'; authError = ''; confirmPassword = ''"
            :disabled="isLoading"
          >
            Back to Sign In
          </button>
        </form>
      </div>
    </div>

    <!-- Shell (after login) -->
    <Shell v-else :connectionState="connectionState" @signout="handleLogout" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
  createBrowserAgent,
  saveBrowserCredentials,
  loadBrowserCredentials,
  clearBrowserCredentials,
  saveApiCredentials,
  clearApiCredentials,
  type BrowserAgent,
  type ConnectionState,
  type BrowserNodeCredentials,
} from '@stark-o/browser-runtime';
import { useShellStore } from '~/stores/shell';

const connectionState = ref<ConnectionState>('disconnected');
const isAuthenticated = ref(false);
const authMode = ref<'login' | 'register'>('login');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const authError = ref('');
const isLoading = ref(false);
const registrationEnabled = ref(false);
const shell = useShellStore();
let agent: BrowserAgent | null = null;

/**
 * Persist credentials to both the agent store (for node registration)
 * and the API store (for createStarkAPI() used by terminal & start-menu).
 */
function persistCredentials(creds: BrowserNodeCredentials): void {
  saveBrowserCredentials(creds);
  saveApiCredentials({
    accessToken: creds.accessToken,
    refreshToken: creds.refreshToken,
    expiresAt: creds.expiresAt,
    userId: creds.userId,
    email: creds.email,
  });
}

/** Clear both credential stores. */
function clearAllCredentials(): void {
  clearBrowserCredentials();
  clearApiCredentials();
}

/**
 * Get the HTTP base URL from the current page
 */
function getHttpBaseUrl(): string {
  return `${window.location.protocol}//${window.location.host}`;
}

/**
 * Check if registration is enabled on the server
 */
async function checkRegistrationStatus(): Promise<void> {
  try {
    const response = await fetch(`${getHttpBaseUrl()}/auth/setup/status`);
    const result = await response.json() as {
      success: boolean;
      data?: { needsSetup: boolean; registrationEnabled: boolean };
    };
    if (result.success && result.data) {
      registrationEnabled.value = result.data.registrationEnabled;
    }
  } catch (err) {
    console.warn('Failed to check registration status:', err);
  }
}

/**
 * Handle login form submission
 */
async function handleLogin(): Promise<void> {
  authError.value = '';
  isLoading.value = true;

  try {
    const response = await fetch(`${getHttpBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });

    const result = await response.json() as {
      success: boolean;
      data?: {
        accessToken: string;
        refreshToken?: string;
        expiresAt: string;
        user: { id: string; email: string };
      };
      error?: { code: string; message: string };
    };

    if (!result.success || !result.data) {
      // Generic error message to avoid leaking user existence info
      authError.value = 'Invalid email or password.';
      return;
    }

    // Save credentials to localStorage (no password stored)
    const credentials: BrowserNodeCredentials = {
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      expiresAt: result.data.expiresAt,
      userId: result.data.user.id,
      email: result.data.user.email,
      createdAt: new Date().toISOString(),
    };
    persistCredentials(credentials);

    password.value = '';
    isAuthenticated.value = true;
    await startAgent(result.data.accessToken);
  } catch (err) {
    console.error('Login failed:', err);
    authError.value = 'Unable to connect to the server. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/**
 * Handle registration form submission
 */
async function handleRegister(): Promise<void> {
  authError.value = '';
  isLoading.value = true;

  if (password.value !== confirmPassword.value) {
    authError.value = 'Passwords do not match.';
    isLoading.value = false;
    return;
  }

  try {
    const response = await fetch(`${getHttpBaseUrl()}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const result = await response.json() as {
      success: boolean;
      data?: {
        accessToken: string;
        refreshToken?: string;
        expiresAt: string;
        user: { id: string; email: string };
      };
      error?: { code: string; message: string };
    };

    if (!result.success || !result.data) {
      const errorCode = result.error?.code ?? '';
      if (errorCode === 'CONFLICT' || result.error?.message?.toLowerCase().includes('already')) {
        authError.value = 'An account with this email already exists. Please sign in instead.';
      } else {
        authError.value = result.error?.message ?? 'Registration failed. Please try again.';
      }
      return;
    }

    // Save credentials to localStorage (no password stored)
    const credentials: BrowserNodeCredentials = {
      accessToken: result.data.accessToken,
      refreshToken: result.data.refreshToken,
      expiresAt: result.data.expiresAt,
      userId: result.data.user.id,
      email: result.data.user.email,
      createdAt: new Date().toISOString(),
    };
    persistCredentials(credentials);

    password.value = '';
    confirmPassword.value = '';
    isAuthenticated.value = true;
    await startAgent(result.data.accessToken);
  } catch (err) {
    console.error('Registration failed:', err);
    authError.value = 'Unable to connect to the server. Please try again.';
  } finally {
    isLoading.value = false;
  }
}

/** Name used when the start-menu pack is registered */
const START_MENU_PACK_NAME = 'start-menu';

/**
 * Start the browser agent with the given auth token.
 * Auth credentials are persisted in localStorage (shared origin) so
 * system apps running in srcdoc iframes pick them up automatically
 * via createStarkAPI() — no postMessage relay needed.
 * The browser node ID is passed through the pack execution context
 * (STARK_NODE_ID env var) for consistency with other context values.
 */
async function startAgent(authToken: string): Promise<void> {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  agent = createBrowserAgent({
    orchestratorUrl: wsUrl,
    nodeName: 'production-browser-1',
    runtimeType: 'browser',
    debug: true,
    workerScriptUrl: '/_nuxt/pack-worker.js',
    autoRegister: false,
    authToken,
    resumeExisting: true,
    containerIdProvider: (podId: string, packName: string) => {
      // Start-menu pack: attach to the dedicated chromeless surface
      if (packName === START_MENU_PACK_NAME) {
        shell.startMenuAttached = true;
        // Hide immediately — logo click will toggle visibility
        shell.hideStartMenu();
        return shell.startMenuContainerId;
      }
      // Normal packs: open a window with chrome
      const win = shell.openWindow({ podId, title: packName });
      return win.containerId;
    },
  });

  agent.on((event, _data) => {
    if (event === 'connecting') connectionState.value = 'connecting';
    else if (event === 'connected') connectionState.value = 'connected';
    else if (event === 'authenticated') connectionState.value = 'authenticated';
    else if (event === 'registered') {
      connectionState.value = 'registered';
    }
    else if (event === 'disconnected') connectionState.value = 'disconnected';
    else if (event === 'reconnecting') connectionState.value = 'connecting';
    else if (event === 'pod:stopped' && _data && typeof _data === 'object' && 'podId' in _data) {
      const podId = (_data as { podId: string }).podId;
      const win = shell.windows.find((w) => w.podId === podId);
      if (win) shell.closeWindow(win.id);
    }
  });

  try {
    await agent.start();
  } catch (error) {
    console.error('Failed to start browser agent:', error);
  }
}

/**
 * Handle logout
 */
async function handleLogout(): Promise<void> {
  if (agent) {
    await agent.stop();
    agent = null;
  }
  // Close all shell windows
  for (const w of [...shell.windows]) {
    shell.closeWindow(w.id);
  }
  shell.startMenuAttached = false;
  shell.hideStartMenu();
  clearAllCredentials();
  connectionState.value = 'disconnected';
  isAuthenticated.value = false;
  email.value = '';
  password.value = '';
  confirmPassword.value = '';
  authError.value = '';
}

onMounted(async () => {
  // Check if registration is enabled
  await checkRegistrationStatus();

  // Check for existing valid credentials in localStorage
  const storedCreds = loadBrowserCredentials();
  if (storedCreds) {
    const expiresAt = new Date(storedCreds.expiresAt);
    if (expiresAt > new Date()) {
      // Valid credentials exist, auto-start agent
      isAuthenticated.value = true;
      await startAgent(storedCreds.accessToken);
      return;
    }

    // Try to refresh if we have a refresh token
    if (storedCreds.refreshToken) {
      try {
        const response = await fetch(`${getHttpBaseUrl()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: storedCreds.refreshToken }),
        });
        const result = await response.json() as {
          success: boolean;
          data?: {
            accessToken: string;
            refreshToken?: string;
            expiresAt: string;
            user: { id: string; email: string };
          };
        };
        if (result.success && result.data) {
          const refreshedCreds: BrowserNodeCredentials = {
            accessToken: result.data.accessToken,
            refreshToken: result.data.refreshToken ?? storedCreds.refreshToken,
            expiresAt: result.data.expiresAt,
            userId: result.data.user.id,
            email: result.data.user.email,
            createdAt: storedCreds.createdAt,
          };
          persistCredentials(refreshedCreds);
          isAuthenticated.value = true;
          await startAgent(refreshedCreds.accessToken);
          return;
        }
      } catch (err) {
        console.warn('Token refresh failed, showing login screen:', err);
      }
    }

    // Credentials expired and refresh failed, clear them
    clearAllCredentials();
  }
});

onUnmounted(async () => {
  if (agent) {
    await agent.stop();
    agent = null;
  }
});
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* Auth styles */
.auth-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
  margin: 0;
  padding: 1rem;
}

.auth-card {
  background: #ffffff;
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  text-align: center;
  border: none;
  outline: none;
}

.logo {
  width: 300px;
  height: auto;
  margin-bottom: 1rem;
}

.auth-title {
  font-size: 1.5rem;
  color: #1a1a1a;
  margin: 0 0 1.5rem 0;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-group {
  text-align: left;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.25rem;
}

.form-group input {
  width: 100%;
  padding: 0.625rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9375rem;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-group input:disabled {
  background-color: #f3f4f6;
  cursor: not-allowed;
}

.error-message {
  background: #fef2f2;
  color: #dc2626;
  padding: 0.625rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
  border: 1px solid #fee2e2;
}

.btn {
  padding: 0.625rem 1.25rem;
  border: none;
  border-radius: 6px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: #3b82f6;
  color: #ffffff;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2563eb;
}

.btn-secondary {
  background-color: transparent;
  color: #6b7280;
  border: 1px solid #d1d5db;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #f9fafb;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
</style>
