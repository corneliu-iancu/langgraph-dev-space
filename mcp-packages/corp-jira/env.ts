import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPaths = [
  join(__dirname, '.env'),
  join(__dirname, '..', '.env')
];

// Try to find .env file in possible locations
const envPath = envPaths.find(path => existsSync(path));

if (!envPath) {
  throw new Error('No .env file found in any of these locations: ' + envPaths.join(', '));
}

console.error('Loading .env file from:', envPath);

// Load environment variables silently
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error('Error loading .env file:', result.error);
} else {
  console.error('Environment variables loaded successfully');
  console.error('JIRA_EMAIL:', process.env.JIRA_EMAIL);
  console.error('JIRA_PERSONAL_ACCESS_TOKEN:', process.env.JIRA_PERSONAL_ACCESS_TOKEN ? '[REDACTED]' : 'not set');
}
