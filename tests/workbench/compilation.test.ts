import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkbenchError, type WorkbenchClient } from "../../src/workbench/client.js";
import { decodeResponse, encodePascalString } from "../../src/workbench/protocol.js";
import { runCompilation } from "../../src/workbench/compilation.js";

const log = vi.hoisted(() => ({ text: "", available: true }));
vi.mock("node:fs/promises", () => ({
  stat: async () => {
    if (!log.available) throw new Error("unreadable");
    return { size: Buffer.byteLength(log.text) };
  },
  open: async () => ({
    stat: async () => ({ size: Buffer.byteLength(log.text) }),
    read: async (buffer: Buffer, _offset: number, length: number, position: number) => {
      const data = Buffer.from(log.text).subarray(position, position + length);
      data.copy(buffer);
      return { bytesRead: data.length };
    },
    close: async () => {},
  }),
}));

const completion = "\nSCRIPT : Module: Game; loaded 10x files\nPROFILING : Reloading game scripts took: 13546 ms\n";
const session = { projectPath: "F:/addon.gproj", logPath: "F:/console.log", reloadProtocol: "native-v1" };

function bridge(dispatch: (params: Record<string, unknown>) => Promise<unknown>, ping = () => session) {
  let prepared: Record<string, unknown> = {};
  const call = vi.fn(async (api: string, params: Record<string, unknown> = {}) => {
    if (api === "EMCP_WB_Ping") return ping();
    if (api === "EMCP_WB_Reload") {
      prepared = params;
      return { status: "prepared" };
    }
    return dispatch(api === "ReloadScripts" ? prepared : params);
  });
  return { client: { call, invalidateMode: vi.fn() } as unknown as WorkbenchClient, call };
}

describe("compilation outcome monitoring", () => {
  beforeEach(() => { vi.useFakeTimers(); log.text = ""; log.available = true; });
  afterEach(() => { vi.useRealTimers(); });

  it("does not dispatch native reload until preparation returns", async () => {
    let release!: (value: unknown) => void;
    const preparation = new Promise(resolve => { release = resolve; });
    const call = vi.fn(async (api: string) => {
      if (api === "EMCP_WB_Ping") return session;
      if (api === "EMCP_WB_Reload") return preparation;
      throw new WorkbenchError("Compilation failed", "API_ERROR");
    });
    const client = { call, invalidateMode: vi.fn() } as unknown as WorkbenchClient;
    const pending = runCompilation(client, "EMCP_WB_Reload", {}, true);
    const rejected = expect(pending).rejects.toThrow("Compilation failed");
    await vi.advanceTimersByTimeAsync(1000);
    expect(call.mock.calls.map(([api]) => api)).toEqual(["EMCP_WB_Ping", "EMCP_WB_Reload"]);
    release({ status: "prepared" });
    await rejected;
    expect(call.mock.calls.map(([api]) => api)).toEqual(["EMCP_WB_Ping", "EMCP_WB_Reload", "ReloadScripts"]);
  });

  it("never reloads after a lost preparation response", async () => {
    const call = vi.fn(async (api: string) => {
      if (api === "EMCP_WB_Ping") return session;
      throw new WorkbenchError("prepare timeout", "TIMEOUT");
    });
    const client = { call, invalidateMode: vi.fn() } as unknown as WorkbenchClient;
    await expect(runCompilation(client, "EMCP_WB_Reload", {}, true)).rejects.toThrow("prepare timeout");
    expect(call.mock.calls.some(([api]) => api === "ReloadScripts")).toBe(false);
  });

  it("rejects legacy handlers before calling their unsafe reload", async () => {
    const { client, call } = bridge(async () => ({}), () => ({ ...session, reloadProtocol: "" }));
    await expect(runCompilation(client, "EMCP_WB_Reload", {}, true)).rejects.toThrow("Update the Workbench");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("accepts documented native empty success only when explicitly enabled", () => {
    const ok = encodePascalString("Ok");
    expect(decodeResponse(ok, true)).toEqual({});
    expect(() => decodeResponse(ok)).toThrow("no payload");
    expect(() => decodeResponse(encodePascalString("Compilation failed"), true)).toThrow("Compilation failed");
  });

  it("waits beyond ten seconds for fresh completion without repeating the mutation", async () => {
    const { client, call } = bridge(async params => {
      log.text += `[EnfusionMCP compilation ${params.operationId}]`;
      setTimeout(() => { log.text += completion; }, 13_500);
      return { status: "requested" };
    });
    const pending = runCompilation(client, "EMCP_WB_Reload", {}, true);
    await vi.advanceTimersByTimeAsync(15_000);
    expect((await pending).status).toBe("completed");
    expect(call.mock.calls.filter(([api]) => api === "ReloadScripts")).toHaveLength(1);
  });

  it("recovers an interrupted response and confirms evidence without redispatch", async () => {
    const { client, call } = bridge(async params => {
      log.text += `[EnfusionMCP compilation ${params.operationId}]`;
      setTimeout(() => { log.text += completion; }, 25_000);
      await new Promise(resolve => setTimeout(resolve, 20_000));
      throw new WorkbenchError("response timed out", "TIMEOUT");
    });
    const pending = runCompilation(client, "EMCP_WB_Reload", {}, true);
    await vi.advanceTimersByTimeAsync(27_000);
    expect((await pending).status).toBe("completed");
    expect(call.mock.calls.filter(([api]) => api === "ReloadScripts")).toHaveLength(1);
  });

  it("does not accept a prior compilation or Ping as completion", async () => {
    log.text = completion;
    const { client } = bridge(async () => ({ status: "requested" }));
    const pending = runCompilation(client, "EMCP_WB_Reload", {}, true);
    await vi.advanceTimersByTimeAsync(91_000);
    expect((await pending).status).toBe("unconfirmed");
  });

  it("reports unavailable logs as unconfirmed", async () => {
    log.available = false;
    const { client } = bridge(async () => ({ status: "requested" }));
    expect((await runCompilation(client, "EMCP_WB_Reload", {}, true)).status).toBe("unconfirmed");
  });

  it("rejects a session change even if completion was logged", async () => {
    let changed = false;
    const { client } = bridge(async params => {
      log.text += `[EnfusionMCP compilation ${params.operationId}]${completion}`;
      changed = true;
      return { status: "requested" };
    }, () => changed ? { ...session, logPath: "F:/new-session.log" } : session);
    expect((await runCompilation(client, "EMCP_WB_Reload", {}, true)).status).toBe("unconfirmed");
  });

  it("does not mask observed handler leaks with a later completion line", async () => {
    const { client } = bridge(async params => {
      log.text += `[EnfusionMCP compilation ${params.operationId}]\nSCRIPT (E): Leaked 'EMCP_WB_ReloadResponse' script instance (1x)!${completion}`;
      return { status: "requested" };
    });
    expect((await runCompilation(client, "EMCP_WB_Reload", {}, true)).status).toBe("failed");
  });
});
