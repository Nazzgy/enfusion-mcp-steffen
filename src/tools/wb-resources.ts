import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionRejected } from "../workbench/outcome.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus, requireEditMode } from "../workbench/status.js";

export function registerWbResources(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_resources",
    {
      description:
        "Manage Workbench resources. Register new resources, request resource rebuilds, get resource info, or open a resource in its editor. " +
        "To SEARCH for resources by name, use asset_search (searches base game data and .pak archives offline) — this tool cannot list or browse.",
      inputSchema: {
        configuration: z.enum(["PC", "XBOX_ONE", "XBOX_SERIES", "PS4", "PS5", "HEADLESS"]).default("PC").describe("Target configuration for rebuild. Completion must be checked in the native build log."),
        action: z
          .enum(["register", "rebuild", "getInfo", "open"])
          .describe(
            "Action: register (add resource to DB), rebuild (request a single resource build, not the resource database), getInfo (resource metadata), open (open in editor)"
          ),
        path: z
          .string()
          .describe("Exact resource path. Required for all actions."),
        buildRuntime: z
          .boolean()
          .optional()
          .describe("Build runtime data during register. Rebuild always uses the selected configuration."),
      },
    },
    async ({ action, path, buildRuntime, configuration }) => {
      try {
        // Mutating actions require edit mode
        if (action === "register" || action === "rebuild") {
          const modeErr = requireEditMode(client, `${action} resource`);
          if (modeErr) {
            return { content: [{ type: "text" as const, text: modeErr + formatConnectionStatus(client) }] };
          }
        }

        if (action === "getInfo") {
          // Use built-in GetResourceInfo handler
          const result = await client.call<Record<string, unknown>>("GetResourceInfo", {
            path,
          });

          const lines = [`**Resource Info**\n`];
          lines.push(`- **Path:** ${path}`);
          if (result.guid) lines.push(`- **GUID:** ${result.guid}`);
          if (result.type) lines.push(`- **Type:** ${result.type}`);
          if (result.size !== undefined) lines.push(`- **Size:** ${result.size}`);
          if (result.lastModified) lines.push(`- **Modified:** ${result.lastModified}`);
          if (result.dependencies && Array.isArray(result.dependencies)) {
            lines.push(`\n### Dependencies (${result.dependencies.length})`);
            for (const dep of result.dependencies) {
              lines.push(`- ${dep}`);
            }
          }

          // Fallback for unknown response shapes
          const knownKeys = new Set(["guid", "type", "size", "lastModified", "dependencies", "path"]);
          for (const [key, val] of Object.entries(result)) {
            if (!knownKeys.has(key) && val !== undefined) {
              lines.push(`- **${key}:** ${typeof val === "object" ? JSON.stringify(val) : val}`);
            }
          }

          return { content: [{ type: "text" as const, text: lines.join("\n") + formatConnectionStatus(client) }] };
        }

        // register, rebuild, open all use EMCP_WB_Resources
        const params: Record<string, unknown> = { action, path, configuration };
        if (buildRuntime !== undefined) params.buildRuntime = buildRuntime;

        const result = await client.call<Record<string, unknown>>("EMCP_WB_Resources", params);

        const actionLabels: Record<string, string> = {
          register: `Registered resource: ${path}`,
          rebuild: `Resource rebuild requested (${configuration}): ${path}. Completion not verified; inspect the native build log.`,
          open: `Opened resource: ${path}`,
        };

        return {
          isError: actionRejected(result),
          content: [
            {
              type: "text" as const,
              text: `**${actionRejected(result) ? "Resource action failed" : actionLabels[action]}**${result.message ? `\n\n${result.message}` : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error managing resource "${path}" (${action}): ${msg}${formatConnectionStatus(client)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
