import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionRejected } from "../workbench/outcome.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus, requireEditMode } from "../workbench/status.js";

// Menu paths that are known-safe for read-only or non-destructive use
const BLOCKED_MENU_PREFIXES = [
  "File,Close",
  "File,New",
  "File,Exit",
  "File,Quit",
];

export function registerWbExecuteAction(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_execute_action",
    {
      description:
        "Execute any Workbench menu action by its menu path. Use comma-separated path segments to identify the action (e.g., 'Tools,Reload Scripts' or 'File,Save'). " +
        "Some destructive actions (File,Close; File,New; File,Exit) are blocked for safety.",
      inputSchema: {
        module: z.enum(["WorldEditor", "ScriptEditor", "ResourceManager", "AudioEditor", "AnimEditor", "ParticleEditor", "BehaviorEditor", "LocalizationEditor"]).default("WorldEditor").describe("Editor that owns the menu. Audio conversion is AudioEditor > Tools > File Converter."),
        menuPath: z
          .string()
          .describe(
            "Comma-separated menu path (e.g., 'Tools,Reload Scripts', 'File,Save', 'Edit,Undo')"
          ),
      },
    },
    async ({ menuPath, module }) => {
      try {
        // Block known-destructive menu paths
        const normalizedPath = menuPath.split(",").map(part => part.trim()).join(",");
        for (const blocked of BLOCKED_MENU_PREFIXES) {
          if (normalizedPath.toLowerCase().startsWith(blocked.toLowerCase())) {
            return {
              content: [{
                type: "text" as const,
                text: `**Blocked:** "${menuPath}" is a destructive action and cannot be executed via this tool. Perform it manually in Workbench.${formatConnectionStatus(client)}`,
              }],
            };
          }
        }

        // Mutating actions require edit mode
        const modeErr = requireEditMode(client, `execute menu action "${menuPath}"`);
        if (modeErr) {
          return { content: [{ type: "text" as const, text: modeErr + formatConnectionStatus(client) }] };
        }
        const result = await client.call<Record<string, unknown>>("EMCP_WB_ExecuteAction", {
          menuPath: normalizedPath,
          module,
        });

        return {
          isError: actionRejected(result),
          content: [
            {
              type: "text" as const,
              text: `**${actionRejected(result) ? "Action not executed" : "Action dispatched (completion not verified)"}**\n\nModule: ${module}\nMenu path: ${normalizedPath}${result.message ? `\n${result.message}` : ""}${result.result ? `\nResult: ${JSON.stringify(result.result)}` : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error executing action "${menuPath}": ${msg}${formatConnectionStatus(client)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
