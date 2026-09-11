import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WorkbenchClient } from "../../src/workbench/client.js";
import { registerWbExecuteAction } from "../../src/tools/wb-execute-action.js";
import { registerWbResources } from "../../src/tools/wb-resources.js";
import { registerWbReload } from "../../src/tools/wb-reload.js";

function setup(register: (s: McpServer, c: WorkbenchClient) => void, response: Record<string, unknown>) {
  let schema: z.ZodObject<any>;
  let callback: (args: any) => Promise<any>;
  const call = vi.fn().mockResolvedValue(response);
  const server = { registerTool: (_name: string, options: any, handler: any) => {
    schema = z.object(options.inputSchema); callback = handler;
  }} as unknown as McpServer;
  register(server, { call, state: { connected: true, mode: "edit" } } as unknown as WorkbenchClient);
  return {call, invoke: (args: unknown) => callback(schema.parse(args))};
}

describe("Workbench action result contracts", () => {
  it("routes Audio Editor actions through the public schema", async () => {
    const tool = setup(registerWbExecuteAction, {status: "ok", executed: 1});
    const r = await tool.invoke({module: "AudioEditor", menuPath: " Tools , File Converter "});
    expect(tool.call).toHaveBeenCalledWith("EMCP_WB_ExecuteAction", {module: "AudioEditor", menuPath: "Tools,File Converter"});
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toContain("completion not verified");
  });
  it("retains the WorldEditor default", async () => {
    const tool = setup(registerWbExecuteAction, {status: "ok", executed: 1});
    await tool.invoke({menuPath: "Edit,Select All"});
    expect(tool.call.mock.calls[0][1].module).toBe("WorldEditor");
  });
  it.each([
    {status: "error", message: "Module not available: AudioEditor"},
    {status: "ok", executed: 0},
    {status: "ok", executed: false},
    {status: "ok", message: "ExecuteAction returned false (action may not exist)"},
  ])("does not claim execution on refusal %j", async response => {
    const r = await setup(registerWbExecuteAction, response).invoke({menuPath: "Tools,Missing"});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Action not executed");
  });
  it("preserves blocked actions across modules and whitespace", async () => {
    const tool = setup(registerWbExecuteAction, {});
    const r = await tool.invoke({module: "AudioEditor", menuPath: " file , Exit "});
    expect(tool.call).not.toHaveBeenCalled();
    expect(r.content[0].text).toContain("Blocked");
  });
  it.each([undefined, "HEADLESS"])("sends rebuild configuration %s without promising completion", async configuration => {
    const tool = setup(registerWbResources, {status: "requested", message: "Build requested"});
    const r = await tool.invoke({action: "rebuild", path: "Assets/test.fbx", configuration});
    expect(tool.call.mock.calls[0][1].configuration).toBe(configuration ?? "PC");
    expect(r.content[0].text).toContain("Completion not verified");
    expect(r.content[0].text).not.toContain("Rebuilt resource database");
  });
  it.each(["register", "open"])("propagates native %s failure", async action => {
    const r = await setup(registerWbResources, {status: "error", message: "Resource unavailable"}).invoke({action,path: "missing.fbx"});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain("Resource action failed");
  });
  it("rejects an empty rebuild configuration", () => {
    expect(() => setup(registerWbResources, {}).invoke({action: "rebuild",path:"x",configuration:""})).toThrow();
  });
  it.each([
    {status: "error", message: "Scripts dispatched; plugins failed"},
    {status: "ok", message: "Scripts: compilation triggered (ExecuteAction=false)"},
  ])("reports incomplete reload as an error %j", async response => {
    const r = await setup(registerWbReload, response).invoke({target: "both"});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).not.toContain("Reload Complete");
  });
  it("does not equate a dispatched reload with successful compilation", async () => {
    const r = await setup(registerWbReload, {status: "requested", message: "Dispatched"}).invoke({});
    expect(r.isError).toBe(false);
    expect(r.content[0].text).toContain("compilation not verified");
  });
});
