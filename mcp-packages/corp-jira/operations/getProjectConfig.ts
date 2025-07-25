import { z } from "zod";
import { jiraRequest } from "../common/utils.js";

export const GetProjectConfigSchema = z.object({
  projectKey: z.string().describe("The project key (e.g., 'PS', 'EXAMPLE-PROJECT')"),
  includeMetadata: z.boolean().optional().default(true).describe("Include additional metadata like issue types, priorities, and components")
});

interface ProjectMetadata {
  issueTypes: Array<{
    id: string;
    name: string;
    description?: string;
    subtask: boolean;
    iconUrl?: string;
    avatarId?: number;
    hierarchyLevel?: number;
  }>;
  priorities: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  components: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  versions: Array<{
    id: string;
    name: string;
    description?: string;
    released: boolean;
  }>;
  statuses: Array<{
    id: string;
    name: string;
    description?: string;
    statusCategory: {
      key: string;
      name: string;
    };
  }>;
  customFields: Array<{
    id: string;
    name: string;
    type: string;
    description?: string;
    required: boolean;
  }>;
}

export async function getProjectConfig(params: z.infer<typeof GetProjectConfigSchema>) {
  try {
    // Get comprehensive project information using expand parameters for maximum detail:
    // - description: Project description (included by default)
    // - issueTypes: Issue types with enhanced details (iconUrl, avatarId, hierarchy)
    // - lead: Enhanced project lead information (accountId, accountType, active status)
    // - projectKeys: All project keys associated with the project
    // - issueTypeHierarchy: The project's issue type hierarchy structure
    const project = await jiraRequest(`project/${params.projectKey}?expand=description,issueTypes,lead,projectKeys,issueTypeHierarchy`);
    
    if (!project || typeof project !== 'object') {
      throw new Error(`Project ${params.projectKey} not found or invalid response`);
    }
    
    const projectData = project as any;
    
    // Build the basic response with expanded details
    const response: any = {
      success: true,
      project: {
        key: projectData.key,
        name: projectData.name,
        description: projectData.description || null,
        lead: projectData.lead ? {
          name: projectData.lead.name,
          displayName: projectData.lead.displayName,
          emailAddress: projectData.lead.emailAddress,
          accountId: projectData.lead.accountId,
          accountType: projectData.lead.accountType,
          active: projectData.lead.active
        } : null,
        projectTypeKey: projectData.projectTypeKey,
        url: projectData.self,
        avatarUrls: projectData.avatarUrls,
        // Include expanded project keys if available
        projectKeys: projectData.projectKeys || null,
        // Include issue type hierarchy if available
        issueTypeHierarchy: projectData.issueTypeHierarchy || null
      }
    };
    
    // If metadata is requested, fetch additional project configuration
    if (params.includeMetadata) {
      const metadata: Partial<ProjectMetadata> = {};
      
      try {
        // Get project's available issue types (now with expanded details)
        if (projectData.issueTypes) {
          metadata.issueTypes = projectData.issueTypes.map((type: any) => ({
            id: type.id,
            name: type.name,
            description: type.description || null,
            subtask: type.subtask || false,
            iconUrl: type.iconUrl || null,
            avatarId: type.avatarId || null,
            hierarchyLevel: type.hierarchyLevel || null
          }));
        }
        
        // Get project components
        if (projectData.components) {
          metadata.components = projectData.components.map((component: any) => ({
            id: component.id,
            name: component.name,
            description: component.description || null
          }));
        }
        
        // Get project versions
        if (projectData.versions) {
          metadata.versions = projectData.versions.map((version: any) => ({
            id: version.id,
            name: version.name,
            description: version.description || null,
            released: version.released || false
          }));
        }
        
        // Get additional metadata via separate API calls
        try {
          // Get all priorities (system-wide, but useful for context)
          const priorities = await jiraRequest('priority');
          if (Array.isArray(priorities)) {
            metadata.priorities = priorities.map((priority: any) => ({
              id: priority.id,
              name: priority.name,
              description: priority.description || null
            }));
          }
        } catch (error) {
          console.error('Failed to fetch priorities:', error);
        }
        
        try {
          // Get project statuses by fetching a sample of statuses from project workflows
          const statuses = await jiraRequest(`project/${params.projectKey}/statuses`);
          if (Array.isArray(statuses)) {
            const uniqueStatuses = new Map();
            statuses.forEach((issueTypeStatuses: any) => {
              if (issueTypeStatuses.statuses && Array.isArray(issueTypeStatuses.statuses)) {
                issueTypeStatuses.statuses.forEach((status: any) => {
                  if (!uniqueStatuses.has(status.id)) {
                    uniqueStatuses.set(status.id, {
                      id: status.id,
                      name: status.name,
                      description: status.description || null,
                      statusCategory: {
                        key: status.statusCategory?.key || 'unknown',
                        name: status.statusCategory?.name || 'Unknown'
                      }
                    });
                  }
                });
              }
            });
            metadata.statuses = Array.from(uniqueStatuses.values());
          }
        } catch (error) {
          console.error('Failed to fetch statuses:', error);
        }
        
        try {
          // Get project's custom fields (via create metadata)
          const createMeta = await jiraRequest(`issue/createmeta?projectKeys=${params.projectKey}&expand=projects.issuetypes.fields`);
          if (createMeta && typeof createMeta === 'object') {
            const createMetaData = createMeta as any;
            if (createMetaData.projects && createMetaData.projects.length > 0) {
              const project = createMetaData.projects[0];
              if (project.issuetypes && project.issuetypes.length > 0) {
                const customFields = new Map();
                project.issuetypes.forEach((issueType: any) => {
                  if (issueType.fields) {
                    Object.entries(issueType.fields).forEach(([fieldId, field]: [string, any]) => {
                      if (fieldId.startsWith('customfield_') && !customFields.has(fieldId)) {
                        customFields.set(fieldId, {
                          id: fieldId,
                          name: field.name,
                          type: field.schema?.type || 'unknown',
                          description: field.operations?.[0] || null,
                          required: field.required || false
                        });
                      }
                    });
                  }
                });
                metadata.customFields = Array.from(customFields.values());
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch custom fields:', error);
        }
        
        response.metadata = metadata;
      } catch (error) {
        console.error('Error fetching project metadata:', error);
        response.metadataError = `Failed to fetch some metadata: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }
    
    return response;
    
  } catch (error) {
    console.error('Error fetching project configuration:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      projectKey: params.projectKey
    };
  }
} 