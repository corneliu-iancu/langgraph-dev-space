import { z } from "zod";
import { jiraRequest, buildUrl } from "../common/utils.js";

// Schema for get issue type metadata request
export const GetJiraIssueTypeMetadataSchema = z.object({
  projectIdOrKey: z.string().describe("The ID or key of the project"),
  issueTypeId: z.string().describe("The issuetype ID"),
  startAt: z.number().optional().default(0).describe("The index of the first item to return in a page of results (page offset)"),
  maxResults: z.number().optional().default(50).describe("The maximum number of items to return per page (max 200)"),
  minimizeOutput: z.boolean().optional().default(false).describe("When true, filters out non-required fields, fields with default values, and removes 'self' URLs to minimize output")
});

export type GetJiraIssueTypeMetadataRequest = z.infer<typeof GetJiraIssueTypeMetadataSchema>;

/**
 * Recursively removes all "self" keys from an object
 */
function removeSelfKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(removeSelfKeys);
  } else if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'self') {
        result[key] = removeSelfKeys(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Filters fields based on minimize criteria
 */
function filterFieldsForMinimize(values: any): any {
  if (!values || !Array.isArray(values)) {
    return values;
  }

  const filteredFields: Array<any> = [];

  for (const value of values) {
    const valueObj = value as any;
    
    // Skip fields that are not required
    if (valueObj.required === false) {
      continue;
    }
    
    // Skip fields that have default values
    if (valueObj.hasDefaultValue === true) {
      continue;
    }

    // Include the field if it passes the filters
    filteredFields.push(valueObj);
  }
  
  return filteredFields;
}

/**
 * Gets create field metadata for a specific project and issue type combination
 * @param params The parameters for retrieving issue type metadata
 * @returns The field metadata for creating issues of this type in the specified project
 */
export async function getJiraIssueTypeMetadata(params: GetJiraIssueTypeMetadataRequest) {
  const { projectIdOrKey, issueTypeId, startAt, maxResults, minimizeOutput } = params;
  
  try {
    // Build the URL with query parameters
    const queryParams: Record<string, string | number | undefined> = {};
    if (startAt !== undefined && startAt !== 0) {
      queryParams.startAt = startAt;
    }
    if (maxResults !== undefined && maxResults !== 50) {
      queryParams.maxResults = Math.min(maxResults, 200); // Enforce max limit
    }
    
    const endpoint = `issue/createmeta/${projectIdOrKey}/issuetypes/${issueTypeId}`;
    const url = buildUrl(endpoint, queryParams);
    
    const response = await jiraRequest(url, {
      method: "GET"
    });
    
    let processedData = response;
    
    // Apply minimization if requested
    if (minimizeOutput) {
      // First remove all "self" keys
      processedData = removeSelfKeys(response);
      
      // Then filter fields based on required and hasDefaultValue criteria
      if (processedData && typeof processedData === 'object' && 'values' in processedData) {
        processedData.values = filterFieldsForMinimize(processedData.values);
      }
    }
    
    return {
      success: true,
      data: processedData,
      projectIdOrKey,
      issueTypeId,
      minimizeOutput: minimizeOutput || false,
      pagination: {
        startAt: startAt || 0,
        maxResults: maxResults || 50
      }
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      projectIdOrKey,
      issueTypeId,
      minimizeOutput: minimizeOutput || false,
      error
    };
  }
} 