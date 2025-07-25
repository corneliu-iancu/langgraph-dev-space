import { z } from "zod";
import { jiraRequest } from "../common/utils.js";

export const GetIssueTypesSchema = z.object({
  projectIdOrKey: z.string().describe("The ID or key of the project"),
  startAt: z.number().min(0).optional().default(0).describe("The index of the first item to return in a page of results (page offset)"),
  maxResults: z.number().min(1).max(200).optional().default(50).describe("The maximum number of items to return per page")
});

interface IssueType {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  subtask: boolean;
  avatarId?: number;
  hierarchyLevel?: number;
  scope?: {
    type: string;
    project?: {
      id: string;
      key: string;
      name: string;
    };
  };
}

interface GetIssueTypesResponse {
  success: boolean;
  issueTypes?: IssueType[];
  startAt?: number;
  maxResults?: number;
  total?: number;
  error?: string;
  projectIdOrKey?: string;
}

export async function getIssueTypes(params: z.infer<typeof GetIssueTypesSchema>): Promise<GetIssueTypesResponse> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append('startAt', params.startAt.toString());
    queryParams.append('maxResults', params.maxResults.toString());
    
    const endpoint = `issue/createmeta/${params.projectIdOrKey}/issuetypes`;
    const response = await jiraRequest(endpoint);
    
    if (!response || typeof response !== 'object') {
      throw new Error(`Invalid response when fetching issue types for project ${params.projectIdOrKey}`);
    }
    
    const responseData = response as any;
    
    // Handle create metadata response structure
    let issueTypes: IssueType[] = [];
    let startAt = params.startAt;
    let maxResults = params.maxResults;
    let total = 0;
    
    // The createmeta endpoint returns: { projects: [{ issuetypes: [...] }] }
    if (responseData.projects && Array.isArray(responseData.projects) && responseData.projects.length > 0) {
      const project = responseData.projects[0];
      if (project.issuetypes && Array.isArray(project.issuetypes)) {
        issueTypes = project.issuetypes;
        total = issueTypes.length;
      }
    } else if (Array.isArray(responseData)) {
      // Direct array response (fallback)
      issueTypes = responseData;
      total = issueTypes.length;
    } else if (responseData.values && Array.isArray(responseData.values)) {
      // Paginated response (fallback)
      issueTypes = responseData.values;
      startAt = responseData.startAt ?? startAt;
      maxResults = responseData.maxResults ?? maxResults;
      total = responseData.total ?? issueTypes.length;
    } else {
      throw new Error('Unexpected response structure from Jira API');
    }
    
    // Map and clean the issue types data
    const cleanedIssueTypes: IssueType[] = issueTypes.map((issueType: any) => ({
      id: issueType.id,
      name: issueType.name,
      description: issueType.description || undefined,
      iconUrl: issueType.iconUrl || undefined,
      subtask: Boolean(issueType.subtask),
      avatarId: issueType.avatarId || undefined,
      hierarchyLevel: issueType.hierarchyLevel || undefined,
      scope: issueType.scope ? {
        type: issueType.scope.type,
        project: issueType.scope.project ? {
          id: issueType.scope.project.id,
          key: issueType.scope.project.key,
          name: issueType.scope.project.name
        } : undefined
      } : undefined
    }));
    
    return {
      success: true,
      issueTypes: cleanedIssueTypes,
      startAt,
      maxResults,
      total
    };
    
  } catch (error) {
    console.error('Error fetching issue types:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      projectIdOrKey: params.projectIdOrKey
    };
  }
} 