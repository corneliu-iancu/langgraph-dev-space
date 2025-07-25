import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import '../env.js';

// Configuration type definition
interface JiraConfig {
  apiBaseUrl: string;
  logFile: string;
  auth: {
    email: string;
    token: string;
  };
  defaultProject?: string;
  maxResults?: number;
  timeout?: number;
  strictSSL?: boolean;
}

// Function to resolve path with tilde expansion
function resolvePath(path: string): string {
  if (path.startsWith('~/')) {
    return path.replace('~', homedir());
  }
  return resolve(path);
}

// Default values that can be overridden by environment variables
const defaults: JiraConfig = {
  apiBaseUrl: "https://jira.corp.adobe.com/rest/api/2",
  logFile: join(homedir(), 'Desktop', 'jira-api.log'),
  auth: {
    email: process.env.JIRA_EMAIL || '',
    token: process.env.JIRA_PERSONAL_ACCESS_TOKEN || ''
  },
  defaultProject: process.env.JIRA_DEFAULT_PROJECT,
  maxResults: parseInt(process.env.JIRA_MAX_RESULTS || '50', 10),
  timeout: parseInt(process.env.JIRA_TIMEOUT || '30000', 10),
  strictSSL: process.env.JIRA_STRICT_SSL !== 'false'
};

// Create a simple internal logging function that doesn't depend on the config
// This avoids circular dependency issues since utils.ts imports config.ts
function internalLog(message: string): void {
  // Only log to stderr for critical messages
  if (message.includes('Failed to create log directory')) {
    console.error(message);
  }
}

// Ensure log directory exists
function ensureLogDirectory(logPath: string): void {
  const dir = dirname(logPath);
  internalLog(`Ensuring log directory exists: ${dir}`);
  if (!existsSync(dir)) {
    try {
      internalLog(`Creating log directory: ${dir}`);
      mkdirSync(dir, { recursive: true });
      internalLog(`Log directory created: ${dir}`);
    } catch (error) {
      console.error(`Failed to create log directory: ${dir}`, error);
    }
  }
}

// Validate and create config
function createConfig(): JiraConfig {
  const config: JiraConfig = {
    apiBaseUrl: process.env.JIRA_API_BASE_URL || defaults.apiBaseUrl,
    logFile: resolvePath(process.env.JIRA_LOG_FILE || defaults.logFile),
    auth: {
      email: process.env.JIRA_EMAIL || defaults.auth.email,
      token: process.env.JIRA_PERSONAL_ACCESS_TOKEN || defaults.auth.token
    },
    defaultProject: process.env.JIRA_DEFAULT_PROJECT || defaults.defaultProject,
    maxResults: parseInt(process.env.JIRA_MAX_RESULTS || String(defaults.maxResults), 10),
    timeout: parseInt(process.env.JIRA_TIMEOUT || String(defaults.timeout), 10),
    strictSSL: process.env.JIRA_STRICT_SSL === undefined ? defaults.strictSSL : process.env.JIRA_STRICT_SSL !== 'false'
  };

  // Validate API URL
  try {
    new URL(config.apiBaseUrl);
  } catch (error) {
    console.error(`Invalid JIRA_API_BASE_URL: ${config.apiBaseUrl}`);
    config.apiBaseUrl = defaults.apiBaseUrl;
  }

  // Validate required auth fields
  if (!config.auth.email || !config.auth.token) {
    throw new Error('JIRA_EMAIL and JIRA_PERSONAL_ACCESS_TOKEN environment variables are required');
  }

  // Ensure log directory exists
  ensureLogDirectory(config.logFile);

  return config;
}

export const config = createConfig();
