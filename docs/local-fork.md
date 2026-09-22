# Local fork workflow

Codex uses this checkout's compiled `dist/index.js` directly, rather than an npx
GitHub tag. Rebuild after TypeScript changes, then restart Codex. Node.js 20+ is
required. Keep `origin` as the personal fork and `upstream` as the original repo.
Review and test upstream updates before using them; do not overwrite local fixes.

## Workbench action fixes (2026-09-12)

- `wb_execute_action` exposes the existing native editor selection, including
  `AudioEditor`, `ResourceManager` and `ScriptEditor`. The default remains
  `WorldEditor`. An unsupported action returns an MCP error, not success.
- `wb_resources` rebuilds one resource with an explicit `configuration` (default
  `PC`). It requests a build; it does not rebuild the resource database or prove
  successful completion. Read the native build log afterward.
- `wb_reload` reports rejected and partially rejected requests as errors. Even an
  accepted menu invocation is not evidence of successful script compilation.
  Unsupported reload paths still need native menu discovery; no working reload
  shortcut is claimed by this change.

Validation: TypeScript build and real MCP stdio initialize/listTools passed.
The changed Enfusion handlers compiled in Workbench 1.8.0.13. Audio Editor menu
dispatch opened File Converter, and a PC resource rebuild completed successfully
in the native log. The full reload completion pipeline is still not automated.
The pre-existing M151A2 integration suite needs a missing external fixture from
the original author's Windows profile; report it separately from portable tests.

The running Codex session retains its old tools until restart. The mod-side
handlers also need deployment from this fork and a Workbench reload/restart before
new parameters work in the engine. Do not confuse the TypeScript server restart
with reloading Enfusion scripts. Review handler deployment diffs in the target mod.

## Verified sound workflow

User-demonstrated workflow: **Audio Editor > Tools > File Converter**. Drag WAV
from the left resource browser into the right conversion list, select the entry,
choose WAV encoding and Dynamic Volume, then Convert. Verify the resulting SND
content, not only its timestamp or a rebuild status. Copying an old SND and changing
its AudioFile metadata does not convert the new WAV. Opening the converter via
`wb_execute_action` is verified; automating the full conversion UI remains future
work. For ACP wiring, include the Sound node in the matching OutputState input
connections as well as setting Sound.outState/outStatePort. A missing FinalMix
input produced "No audio source present in the graph"; connecting it restored
native playback.

## Handler deployment regression (2026-09-12)

A pre-existing EMCP_WB_Ping.c caused launch to skip all other handler updates.
Deployment now compares the complete bundled set (ignoring CRLF/LF differences)
and reports drift before launching, rather than silently using old code or
overwriting project edits. The regression test verifies user files are preserved.
AudioEditor ExecuteAction with Tools,File Converter was observed returning
executed=1 and opening Convert Audio Files after deploying the updated handler.
Workbench state currently mislabels a missing WorldEditorAPI as game mode.
Opening World Editor through ResourceManager > Editors,World Editor establishes
its API and restores correct edit-mode detection. This remains a separate issue.

## Behavior Editor knowledge and resource support (2026-09-22)

The Behavior Editor exploration found three gaps: `.bt` files were absent from
asset search, text readers classified them as binary, and `wb_open_resource`
sent them to WorldEditor while reporting a rejected open as success.

- `asset_search` now indexes `.bt` and provides `type="behavior"`. Game/project
  browsing labels these files `behavior-tree`; both readers accept their text.
- The bundled `EMCP_WB_EditorControl` routes resource opens through
  `Workbench.OpenResource` before acquiring WorldEditor, as vanilla's behavior
  tree validation plugin does. A false return becomes an error. The TypeScript
  response also recognizes rejection messages from older deployed handlers.
- Generic `.layout` opens are rejected on this route because the previously
  recorded LayoutResourceClass crash makes broad automatic routing unsafe.
- `wb_knowledge` includes **Behavior Editor Workflow and MCP** and corrections to
  the older behavior-tree guide: variable references/port indices, current script
  signatures, menu ownership, debug limitations, and explicit evidence boundaries.

Observed before implementation: Workbench 1.8.0.13 opened a locked vanilla tree
through the native picker. An unsaved scratch tree exposed creation, control-flow
connections, typed variables, and structural warnings. Sampled shipped `.bt`
files are plain Enfusion text. No gameplay or automated test was run.

Implementation result: the TypeScript build succeeded. The deployed handler was
loaded after native script reload, and a normal `wb_open_resource` request for
`LookAt.bt` visibly opened the correct tree and returned the new handler message.
`wb_knowledge` returned the new guide in this session. This is evidence for
resource routing and knowledge availability, not for runtime AI or unexercised
error paths. See [the session evidence](behavior-editor-study.md).

Rebuild/restart the MCP server for TypeScript changes and the new KB index entry.
Deploy the bundled handler to the addon and reload Workbench scripts separately.
KB file bodies are read on each call, but the index is cached by the running
server. Old sessions can read changes to an existing indexed guide while missing
the newly indexed guide until restart.

Manual verification after restart/reload:

1. Query `wb_knowledge` for `Behavior Editor Workflow and MCP`.
2. Search `LookAt` with `asset_search`, `type="behavior"`; read the returned `.bt`
   with `game_read` and confirm the `BehaviorTree` text.
3. Open that resource with `wb_open_resource`; inspect the Behavior Editor title,
   graph, and Console. An accepted request alone is not a validity check.
4. A nonexistent `.bt` should report an open failure rather than success.
5. On a mod-owned copy, confirm native Save/Save As and reopening preserve the
   intended graph. Runtime AI behavior needs a separately authorized game session.

For maintenance, keep behavior-resource support aligned across the asset index,
its type filter/schema, the shared file-type label map, and both text allowlists.
Never use a generic success heading when the native opening API rejected a file.

## Desktop restart helper limitation

An attempted Windows restart helper launched with `Start-Process -WindowStyle
Hidden` logged the start of desktop shutdown but never logged the relaunch. The
helper was no longer running afterward, and the user reported reopening Codex
manually. The exact termination mechanism was not established.

Do not treat `Start-Process` or a hidden window as proof that a helper survives
the parent application's shutdown. Prefer a supported MCP reload operation. If
restarting the owning app is necessary, establish an independent lifecycle
supervisor before closing it, and distinguish scheduling a restart from observing
the replacement process. Never promise an automatic relaunch from an unverified
child-process arrangement.
