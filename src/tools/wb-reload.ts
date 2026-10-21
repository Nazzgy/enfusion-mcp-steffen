import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { actionRejected } from "../workbench/outcome.js";
import type { WorkbenchClient } from "../workbench/client.js";
import { formatConnectionStatus } from "../workbench/status.js";
import { runCompilation } from "../workbench/compilation.js";

export function registerWbReload(server: McpServer, client: WorkbenchClient): void {
  server.registerTool(
    "wb_reload",
    {
      description:
        "Reload game scripts through native NET API after the preparation handler returns. Plugin/both reload is rejected; use native Workbench UI for plugins.",
      inputSchema: {
        target: z
          .enum(["scripts", "plugins", "both"])
          .default("scripts")
          .describe("What to reload: scripts, plugins, or both"),
      },
    },
    async ({ target }) => {
      try {
        const result = await runCompilation(client, "EMCP_WB_Reload", { target }, true);

        return {
          isError: actionRejected(result),
          content: [
            {
              type: "text" as const,
              text: `**${actionRejected(result) ? "Reload action failed" : result.status === "completed" ? "Script reload completed" : "Reload outcome unconfirmed"}**\n\n${result.message || "Reload triggered."}${target === "both" ? "\nPlugin reload completion is not independently verified." : ""}${formatConnectionStatus(client)}`,
            },
          ],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `Error reloading: ${msg}${formatConnectionStatus(client)}` }],
        isError: true,
        };
      }
    }
  );
}
