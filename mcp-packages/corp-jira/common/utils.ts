import { fetch, Response } from 'undici';
import { writeFileSync } from 'fs';
import { getUserAgent } from "universal-user-agent";
import { VERSION } from "./version.js";
import { config } from "./config.js";
import { createJiraError } from "./errors.js";
import '../env.js';
import { dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  // Handle 204 No Content responses
  if (response.status === 204) {
    return { success: true };
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const text = await response.text();
    if (!text) {
      return { success: true };
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      logToFile(`Failed to parse JSON response: ${error}`);
      return { success: true };
    }
  }
  if (contentType?.includes("application/xml")) {
    const text = await response.text();
    logToFile(`Received XML response: ${text}`);
    throw new Error(`Received XML response instead of JSON. This usually indicates an authentication or API endpoint issue.`);
  }
  return response.text();
}

export function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  // Ensure path doesn't start with a slash
  const cleanPath = path.replace(/^\//, '');
  const url = new URL(`${config.apiBaseUrl}/${cleanPath}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, value.toString());
    }
  });
  return url.toString();
}

const USER_AGENT = `modelcontextprotocol/servers/jira/v${VERSION} ${getUserAgent()}`;

// Add interface for the function type with hasLoggedPath property
interface LogFunction {
  (message: string): void;
  hasLoggedPath?: boolean;
}

// Define the logging function with proper typing
export const logToFile: LogFunction = (message: string) => {
  try {
    const timestamp = new Date().toISOString();
    const logMessage = `${timestamp}: ${message}\n`;
    
    // Create directory if it doesn't exist
    const dir = dirname(config.logFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(config.logFile, logMessage, { flag: 'a' });

    // Log path on first write
    if (!logToFile.hasLoggedPath) {
      console.error(`Writing logs to: ${config.logFile}`);
      logToFile.hasLoggedPath = true;
    }
  } catch (error) {
    // Fallback to console if file writing fails
    console.error(`Failed to write to log file (${config.logFile}): ${error}`);
    console.error(message);
  }
};

// Initialize the hasLoggedPath property
logToFile.hasLoggedPath = false;

/**
 * Verifies authentication with Jira API
 * @returns The current user information if authenticated
 * @throws Error if authentication fails
 */ 
export async function verifyAuthentication(): Promise<unknown> {
  logToFile("Verifying Jira authentication...");
  return jiraRequest("myself");
}

function constructAuthHeader(email: string, token: string): string {
  try {
    // Check if token is already base64 encoded
    const decodedToken = Buffer.from(token, 'base64').toString();
    if (decodedToken.includes(':')) {
      // Token is already in email:token format and base64 encoded
      logToFile('Using pre-encoded token');
      return `Basic ${token}`;
    }
  } catch (e) {
    // Token is not base64 encoded, which is fine
  }

  // Construct auth string with email and raw token
  const authString = `${email}:${token}`;
  logToFile('Constructing new auth header with email:token format');
  return `Basic ${Buffer.from(authString).toString('base64')}`;
}

export async function jiraRequest(
  path: string,
  options: RequestOptions = {}
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Atlassian-Token": "no-check",  // Required for some Jira operations
    "User-Agent": USER_AGENT,
    ...options.headers,
  };

  // Get auth details from config
  const { email, token } = config.auth;
  if (!email || !token) {
    throw new Error("Email and token are required for authentication");
  }

  // Construct auth header
  headers["Authorization"] = constructAuthHeader(email, token);

  // Build URL
  const url = path.startsWith('http') ? path : buildUrl(path, {});

  logToFile(`Making request to: ${url}`);
  logToFile(`Method: ${options.method || "GET"}`);
  logToFile(`Headers: ${JSON.stringify({...headers, Authorization: '[REDACTED]'}, null, 2)}`);
  if (options.body) {
    logToFile(`Request body: ${JSON.stringify(options.body, null, 2)}`);
  }

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    logToFile(`Response status: ${response.status} ${response.statusText}`);
    logToFile(`Response headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);

    // For 204 No Content responses, return success
    if (response.status === 204) {
      return { success: true };
    }

    const responseBody = await parseResponseBody(response);
    
    // Log response body but redact sensitive information
    const sanitizedBody = typeof responseBody === 'object' ? 
      JSON.stringify(responseBody, (key, value) => 
        ['token', 'password', 'secret'].includes(key.toLowerCase()) ? '[REDACTED]' : value
      , 2) : responseBody;
    logToFile(`Response body: ${sanitizedBody}`);

    if (!response.ok) {
      throw createJiraError(response.status, responseBody);
    }

    return responseBody;
  } catch (error) {
    if (error instanceof Error) {
      logToFile(`Request failed: ${error.message}`);
      throw error;
    }
    throw new Error(`Unknown error occurred: ${String(error)}`);
  }
}

// ... rest of the utility functions remain the same
