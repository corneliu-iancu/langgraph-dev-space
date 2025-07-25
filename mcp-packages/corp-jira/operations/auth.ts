import { z } from "zod";
import { verifyAuthentication } from "../common/utils.js";

// Schema for auth test response
export const AuthTestSchema = z.object({});

/**
 * Tests authentication with Jira API
 * @returns The current user information if authenticated
 */
export async function testAuth() {
  try {
    const response = await verifyAuthentication();
    return {
      success: true,
      message: "Successfully authenticated with Jira API",
      user: response
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error occurred",
      error: error
    };
  }
} 
