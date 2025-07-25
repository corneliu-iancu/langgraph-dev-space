export class JiraError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response: unknown
  ) {
    super(message);
    this.name = "JiraError";
  }
}

export class JiraValidationError extends JiraError {
  constructor(message: string, status: number, response: unknown) {
    super(message, status, response);
    this.name = "JiraValidationError";
  }
}

export class JiraResourceNotFoundError extends JiraError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`, 404, { message: `${resource} not found` });
    this.name = "JiraResourceNotFoundError";
  }
}

export class JiraAuthenticationError extends JiraError {
  constructor(message = "Authentication failed") {
    super(message, 401, { message });
    this.name = "JiraAuthenticationError";
  }
}

export class JiraPermissionError extends JiraError {
  constructor(message = "Insufficient permissions") {
    super(message, 403, { message });
    this.name = "JiraPermissionError";
  }
}

export class JiraRateLimitError extends JiraError {
  constructor(
    message = "Rate limit exceeded",
    public readonly resetAt: Date
  ) {
    super(message, 429, { message, reset_at: resetAt.toISOString() });
    this.name = "JiraRateLimitError";
  }
}

export class JiraConflictError extends JiraError {
  constructor(message: string) {
    super(message, 409, { message });
    this.name = "JiraConflictError";
  }
}

export function isJiraError(error: unknown): error is JiraError {
  return error instanceof JiraError;
}

export function createJiraError(status: number, response: any): JiraError {
  // Handle Jira-specific error responses
  if (response && typeof response === 'object') {
    const errorMessages = response.errorMessages || [];
    const errors = response.errors || {};
    const message = errorMessages.length > 0 
      ? errorMessages.join(', ')
      : Object.entries(errors)
        .map(([key, value]) => `${key}: ${value}`)
        .join(', ') || response.message || 'Unknown error';

    switch (status) {
      case 401:
        return new JiraAuthenticationError(message);
      case 403:
        return new JiraPermissionError(message);
      case 404:
        return new JiraResourceNotFoundError(message);
      case 409:
        return new JiraConflictError(message);
      case 400:
      case 422:
        return new JiraValidationError(message, status, response);
      case 429:
        return new JiraRateLimitError(
          message,
          new Date(response.resetAt || Date.now() + 60000)
        );
      default:
        return new JiraError(message, status, response);
    }
  }

  return new JiraError(
    'Unknown Jira API error',
    status,
    response
  );
}
