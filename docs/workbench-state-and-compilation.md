# Workbench state, compilation, and project identity

## Diagnosis and contract

The previous client gated Stop on a cached mode that Play never invalidated.
Both state handlers also equated an available WorldEditorAPI with Edit and its
absence with Play. Vanilla's SCR_AddPrefabToSelectedEntitiesPlugin instead checks
`WorldEditorAPI.IsGameMode()` explicitly. The handlers now use that native query;
missing API means unknown, and a missing WorldEditor module is reported separately.

Play refreshes its prerequisite and checks it again in the native handler. Stop
always reaches the existing editor regardless of cached mode. Both invalidate the
cache before dispatch, poll actual state afterward, and report an unconfirmed
outcome if the transition cannot be observed. A transport timeout does not cause a
second mutation or an automatic launch. Unknown/unavailable states block edit-only
operations. Legacy `game` responses are treated as unknown because older handlers
inferred them from a missing API.

The generic NET API timeout is 10 seconds. A preserved Stargate Workbench log
recorded `Reloading game scripts took: 13546.183600 ms`, demonstrating why the old
compilation route could report failure before completion. Script reloads and
compile/validate menu actions now use one 90-second monitoring budget with a
20-second initial response wait. They send a unique marker to the handler and
read only new bytes from the active session's console log, as identified by Ping.
Completion requires a matching marker, a Game module load, the relevant profiling
completion line, no script error in that evidence, and a responsive NET API in the
same project/log session. Transport recovery never reissues the mutation.

Unreadable/remote logs, unsupported completion formats, session changes, and
blocked modal dialogs produce an explicit unconfirmed result. A responsive Ping
alone is never compilation evidence.

Script reload now uses two sequential NET API requests. The updated Ping advertises
`reloadProtocol: native-v1`; old handlers are rejected before dispatch. The custom
`EMCP_WB_Reload` handler accepts only `phase: prepare`, records the operation marker,
and returns `prepared` without running any reload. Only after receiving that
response does the client send the documented built-in `ReloadScripts` request.
Thus the custom handler, request and response are no longer alive when their
script module is destroyed. A failed/lost preparation response never authorizes
the second request. The client never retries a dispatched native reload.

The native protocol documents an Ok response without a JSON payload for
ReloadScripts. This is accepted only for that endpoint; other endpoints retain
strict payload checks. General menu requests for script reload use the same
two-request path, and direct unsafe reload menu execution in the script handler
is blocked. Plugin/both reload is explicitly rejected; use the native UI for
plugin reload rather than reintroducing synchronous script-handler execution.

`wb_launch` compares the requested absolute `.gproj` with
the native `System.GetCLIParam("gproj", ...)` returned by Ping. It verifies both reused
and newly launched instances, including concurrent launch callers. Mismatch or
missing identity fails without switching or terminating the existing editor, and
does not change the configured default addon. Loaded dependencies are not proof
that a project is active. The command line identifies the startup selection;
also confirm a known addon resource resolves to the expected native mount.

Deployment exposed that `Workbench.GetCurrentGameProjectFile()` returns
`./addons/data/ArmaReforger.gproj` even when the process was launched with the
Stargate addon and the native log confirms its mount. Do not use that API as
addon identity. `ResourceManager.GetCmdLine("-gproj", ...)` also returned empty
in that session: module command-line options are not the engine startup options.
Use the global `System.GetCLIParam` API (without the leading dash), following
vanilla SCR_DedicatedServerPlugin's `addonsDir` query. If it is absent, fail closed
rather than substituting the base game project.

## Deployment

Build the TypeScript package and restart the MCP server to load it. Review and
synchronize these bundled handlers to the target addon's
`Scripts/WorkbenchGame/EnfusionMCP/` while Workbench is closed:

- `EMCP_WB_Ping.c`
- `EMCP_WB_GetState.c`
- `EMCP_WB_EditorControl.c`
- `EMCP_WB_ExecuteAction.c`
- `EMCP_WB_Reload.c`

Restart Workbench with the intended project. An old Ping handler cannot prove
project identity and is deliberately rejected by an explicit project launch.
Do not overwrite addon-specific handler changes without reviewing their diff.

## Manual verification, only when authorized

1. With only Resource Manager open, call `wb_state`. Expect unavailable/unknown,
   never Play solely because the WorldEditorAPI is absent.
2. Open a world, start Play, and stop immediately without an intervening state
   request. Stop must be dispatched and Edit confirmed by a subsequent state read.
   Repeat after switching modes manually so the client cache is stale.
3. Reload scripts whose compilation takes longer than 10 seconds. Expect one
   dispatch followed by matching completion evidence and a connected NET API.
   Introduce a temporary syntax error only in a disposable project: it must report
   failure, not completion. Restore the file afterward.
4. Check an interrupted response, inaccessible log, or blocking modal. Expect an
   unconfirmed outcome if evidence is missing, with no retry or second Workbench.
5. Request the active `.gproj` with `wb_launch`, then request a different project.
   Expect success for the first and an explicit mismatch for the second; the
   running project and default addon must remain unchanged on mismatch.

## Authorized verification on 2026-10-21

- All 60 targeted Workbench unit tests passed, including six new compilation
  monitoring regressions in `tests/workbench/compilation.test.ts`.
- Live `wb_play` followed immediately by `wb_stop` confirmed Play then Edit.
- A separate live client retained cached Edit while another client entered Play.
  Stop from the stale client still dispatched successfully and confirmed Edit.
- Before opening a world, the unavailable WorldEditorAPI reported unknown rather
  than Play. Opening `worlds/unnamed.ent` confirmed Edit with 173649 entities.
- Requesting the base-game project while Stargate was active was rejected; a
  subsequent Stargate identity check succeeded without switching projects.
- Live script reload completed its engine work in 10543.941100 ms and NET API
  responded afterward, but the log reported leaked `EMCP_WB_ReloadResponse`,
  `EMCP_WB_Reload`, and `EMCP_WB_ReloadRequest` instances. The tool returned failure
  rather than falsely claiming success. Therefore the reload repair is not a
  complete end-to-end pass, despite the timeout/evidence monitoring tests passing.

Prevention rule: do not execute a module-destroying reload while a handler from
that module is still executing. A future lifecycle repair must dispatch outside
the affected handler lifetime, preserve operation correlation, and verify no
handler leak diagnostics. Do not suppress those errors to obtain a green result.
The regression suite explicitly preserves failure for leaks even when followed
by a completion profiling line. No syntax errors were injected into the live addon.

## Native reload deployment verification

The subsequent two-request implementation passed 64 Workbench unit tests and the
TypeScript build. Fresh MCP subprocesses using the built package and real MCP
stdio transport exercised both `wb_reload` and `wb_execute_action` with
`Build,Validate and Reload Scripts`. Both returned confirmed completion with a
responsive NET API. The two native reload durations were 9225.004200 ms and
9759.705400 ms. The corresponding operation-delimited log sections contained no
leaked instances or SCRIPT (E) diagnostics. Play followed by Stop also succeeded
after the second reload, and the final state was Edit on the Stargate project.

Source: installed EnfusionScriptAPI/html/Page_NetApi.html, built-in ReloadScripts
contract. Tests cover ordering, a lost preparation response, legacy capability
rejection, and status-only native success, in addition to monitoring regressions.
After updating the TypeScript build, existing Codex MCP processes still need a
Codex restart to use it. Updated handlers reject old callers safely; deployment
verification uses a freshly started MCP process, not an old chat connection.

After restarting Codex, a direct `wb_reload` call through the chat's MCP connection
also completed successfully in 9992.945000 ms. The fresh operation log contained
zero handler leaks and zero SCRIPT (E) diagnostics. NET API, the Stargate project
identity, and the final Edit mode were confirmed afterward.

## Source editing

Use explicit UTF-8 for both reads and writes in file-rewriting scripts on Windows.
The default Python locale encoding can turn UTF-8 punctuation into mojibake even
when the output is written as UTF-8. Review diffs for unintended encoding changes
before committing generated edits.
