import { open, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { WorkbenchClient, WorkbenchError } from "./client.js";
import { actionRejected } from "./outcome.js";

const active = new WeakSet<WorkbenchClient>();

/** Never retry a dispatched compilation. Follow its own log marker and reconnect. */
export async function runCompilation(
  client: WorkbenchClient,
  apiFunc: string,
  params: Record<string, unknown>,
  expectReload: boolean,
): Promise<Record<string, unknown>> {
  if (active.has(client)) throw new Error("A compilation is already being monitored. Wait for it to finish.");
  active.add(client);
  try {
    const session = await client.call<Record<string, unknown>>("EMCP_WB_Ping", {}, { skipAutoLaunch: true });
    if (expectReload && session.reloadProtocol !== "native-v1") {
      throw new Error("Update the Workbench reload handlers and restart Workbench before reloading. No reload was dispatched.");
    }
    if (expectReload && params.target !== undefined && params.target !== "scripts") {
      throw new Error("Only native game-script reload is supported safely. Reload plugins through the native Workbench UI.");
    }
    const logPath = typeof session.logPath === "string" ? session.logPath : "";
    let offset: number | undefined;
    try { if (logPath) offset = (await stat(logPath)).size; } catch { /* Remote or inaccessible log. */ }
    const operationId = randomUUID();
    const marker = `[EnfusionMCP compilation ${operationId}]`;
    const deadline = Date.now() + 90_000;
    let result: Record<string, unknown> = {};
    let transportError = "";
    client.invalidateMode();
    if (expectReload) {
      // Keep preparation outside transport recovery: a lost preparation response
      // must never authorize the mutation. The custom handler only writes a marker.
      const prepared = await client.call<Record<string, unknown>>("EMCP_WB_Reload", {
        target: "scripts", phase: "prepare", operationId,
      }, { timeout: 10_000, skipAutoLaunch: true });
      if (prepared.status !== "prepared") throw new Error("Reload preparation was not confirmed. No native reload was dispatched.");
    }
    try {
      result = await client.call(expectReload ? "ReloadScripts" : apiFunc,
        expectReload ? {} : { ...params, operationId }, { timeout: 20_000, skipAutoLaunch: true });
      if (actionRejected(result)) return result;
    } catch (err) {
      if (!(err instanceof WorkbenchError) || !["TIMEOUT", "PROTOCOL_ERROR"].includes(err.code)) throw err;
      transportError = err.message;
    }

    let connected = false;
    let evidence = "";
    let logIssue = offset === undefined ? "The active session log is unavailable." : "";
    while (Date.now() < deadline) {
      if (offset !== undefined) {
        try {
          const file = await open(logPath, "r");
          try {
            const size = (await file.stat()).size;
            // Never consume old data after truncation, or silently miss diagnostics.
            if (size < offset || size - offset > 8 * 1024 * 1024) {
              logIssue = "The session log rotated or exceeded the monitoring limit.";
              offset = undefined;
            } else {
              const buffer = Buffer.alloc(size - offset);
              const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
              const text = buffer.subarray(0, bytesRead).toString("utf8");
              const start = text.indexOf(marker);
              if (start >= 0) evidence = text.slice(start + marker.length);
            }
          } finally { await file.close(); }
        } catch { logIssue = "The session log could not be read."; }
      }
      try {
        const current = await client.call<Record<string, unknown>>("EMCP_WB_Ping", {}, {
          timeout: Math.min(3000, Math.max(1, deadline - Date.now())), skipAutoLaunch: true,
        });
        connected = true;
        if (current.projectPath !== session.projectPath || current.logPath !== session.logPath) {
          return { status: "unconfirmed", message: "Workbench session changed during compilation. Result not verified; no action was retried." };
        }
      } catch { connected = false; }

      const failure = evidence.split(/\r?\n/).find(line =>
        /SCRIPT\s+\(E\)|Can't compile|Cannot compile|compilation failed|compiling.*failed/i.test(line));
      if (failure) return { status: "failed", message: `Compilation failed: ${failure.trim()}\nNET API ${connected ? "responding" : "not responding"}.` };

      const completed = expectReload
        ? /PROFILING\s*:\s*Reloading game scripts took:/i.test(evidence) && /Module: Game; loaded /i.test(evidence)
        : /PROFILING\s*:\s*Compiling Game scripts took:/i.test(evidence) && /Module: Game; loaded /i.test(evidence);
      if (completed && connected) {
        return { status: "completed", message: `Compilation completion observed in the active session log; NET API responding.\nLog: ${logPath}` };
      }
      // Without a readable log we can confirm reconnection, but never compilation.
      if (offset === undefined && connected) break;
      await new Promise(r => setTimeout(r, 1000));
    }
    return {
      status: "unconfirmed",
      message: `Compilation outcome is unconfirmed. NET API ${connected ? "responding" : "not responding"}. ` +
        `${logIssue || "No matching completion evidence was observed before the deadline."} ` +
        "Inspect the active Workbench log and any modal dialog before retrying. The action was not repeated and no Workbench was launched." +
        (transportError ? `\nInitial transport: ${transportError}` : ""),
    };
  } finally { active.delete(client); }
}
