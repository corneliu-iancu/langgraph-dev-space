import { z } from "zod";
import { jiraRequest, buildUrl } from "../common/utils.js";
import { logToFile } from "../common/utils.js";

export const GetProjectComponentsSchema = z.object({
  projectIdOrKey: z.string().describe("The project ID or project key (e.g., 'ASSETS' or '12345')")
});
    
interface ComponentData {
  id: string;
  name: string;
  lead?: {
    name: string;
    displayName: string;
  };
  archived: boolean;
}

interface TransformedComponent {
  component_id: string;
  component_name: string;
  ownership: string;
}

export async function getProjectComponents(params: z.infer<typeof GetProjectComponentsSchema>) {
  const { projectIdOrKey } = params;
  
  try {
    // Use the Jira REST API endpoint to get project components
    const rawComponents = await jiraRequest(`project/${projectIdOrKey}/components`, {
      headers: {
        "Accept": "application/json"
      }
    }) as ComponentData[];
    
    // Filter out archived components and transform the data
    const filteredAndTransformedComponents: TransformedComponent[] = [];
    
    if (Array.isArray(rawComponents)) {
      rawComponents.forEach(component => {
        // Only include non-archived components
        if (component.archived === false) {
          filteredAndTransformedComponents.push({
            component_id: component.id,
            component_name: component.name,
            ownership: component.lead?.name || 'unassigned'
          });
        }
      });
    }
    logToFile('getProjectComponents: ' + JSON.stringify(filteredAndTransformedComponents)); // TODO: remove this
    
    return {
      success: true,
      projectIdOrKey,
      components: filteredAndTransformedComponents,
      count: filteredAndTransformedComponents.length
    };
  } catch (error) {
    // Handle specific error cases
    if (error instanceof Error && error.message.includes('404')) {
      throw new Error(`Project '${projectIdOrKey}' not found. Please verify the project key or ID.`);
    }
    if (error instanceof Error && error.message.includes('403')) {
      throw new Error(`Access denied to project '${projectIdOrKey}'. Please check your permissions.`);
    }
    
    throw error;
  }
} 