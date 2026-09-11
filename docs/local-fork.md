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
