import { z } from "zod";
import { jiraRequest, buildUrl } from "../common/utils.js";

export const JiraSearchSchema = z.object({
  jql: z.string(),
  startAt: z.number().optional(),
  maxResults: z.number().optional(),
  fields: z.array(z.string()).optional(),
  expand: z.array(z.string()).optional(),
  properties: z.array(z.string()).optional(),
  fieldsByKeys: z.boolean().optional()
});

export async function searchJiraIssues(params: z.infer<typeof JiraSearchSchema>) {
  // If the input looks like a direct issue key (e.g., "AIF-17"), try to fetch it directly
  if (/^[A-Z]+-\d+$/.test(params.jql)) {
    try {
      const issue = await jiraRequest(`issue/${params.jql}`, {
        headers: {
          "Accept": "application/json"
        }
      });
      return {
        issues: [issue],
        total: 1,
        maxResults: 1
      };
    } catch (error) {
      // If direct fetch fails, fall back to JQL search
      console.error(`Direct issue fetch failed: ${error}`);
    }
  }

  // Regular JQL search
  return jiraRequest(buildUrl("search", {
    jql: params.jql,
    startAt: params.startAt?.toString(),
    maxResults: params.maxResults?.toString(),
    fields: params.fields?.join(','),
    expand: params.expand?.join(','),
    properties: params.properties?.join(','),
    fieldsByKeys: params.fieldsByKeys?.toString()
  }));
}
