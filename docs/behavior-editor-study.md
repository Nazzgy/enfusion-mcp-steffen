# Behavior Editor exploration

Evidence gathered on 2026-09-22 using Workbench 1.8.0.13 (production), the
Stargate Reforged addon, installed API documentation, and the current vanilla
script mirror. Runtime behavior was not tested and no game session was started.

## Observed editor workflow

- Resource Manager: **Editors > Behavior Editor** opens a separate window.
- **File > Open** (`Ctrl+O`) opens a resource picker filtered for behavior trees.
  Search by filename, expand the addon hierarchy if necessary, then double-click
  the matching `.bt`. A collapsed addon root is not evidence of no matches.
- Opening `AI/BehaviorTrees/Animals/AnimalReactToDanger.bt` this way displays a
  locked vanilla tab, its node graph, and its Item explorer. No edit or save was
  performed on the vanilla asset.
- Panels include Item explorer / Nodes palette, Variables, Node parameters /
  Resource Browser, Debug / Breakpoints, and Console.
- File menu: New, Open (`Ctrl+O`), Save (`Ctrl+S`), Save As (`Ctrl+Shift+S`),
  Options, Exit. Edit: Undo (`Ctrl+Z`), Redo (`Ctrl+Y`), Copy (`Ctrl+C`), Cut
  (`Ctrl+X`), Paste (`Ctrl+V`), Group (`Ctrl+G`), Ungroup (`Ctrl+Shift+G`).
- Debug: Continue (`F5`), Pause (`F10`), Toggle Breakpoint (`F9`). These are
  Behavior Editor controls, not World Editor play/stop commands.
- **New** creates an unsaved `*untitled` tab with a Root node. Its console warns
  that Root has no children. Palette placement and connection are separate:
  after dragging a Sequence onto the canvas, click to finish placement, then drag
  Root's lower black bar onto Sequence's upper black bar. The missing-parent and
  Root-without-children warnings disappeared; the empty Sequence warning remained.
- Mouse wheel controls zoom. With the computer-use API in this session, positive
  `scrollY` zoomed out and negative `scrollY` zoomed in. Check the visible zoom
  percentage after the first scroll rather than assuming scroll direction.
- **+ Add variable** opens **Choose a class**, including `BtVariableBool`,
  `BtVariableEntity`, `BtVariableGroup`, `BtVariableInteger`, `BtVariableObject`,
  `BtVariableResourceName`, `BtVariableScalar`, and `BtVariableString`.
  Choosing `BtVariableScalar` opens **Variable Edit** with Name, Description,
  Input, and Output. Creation is separate from placing a graph reference.
- A scalar named `WaitTime` appeared as `float` in the Variables list. Dragging it
  into the graph produced a reference with left Set and right Get pins. The
  Console warned that this variable node had no connection.
- Searching the palette for `Idle` exposed `AITaskIdle`. Its canvas node has a
  `PeriodKey` input. Selecting it exposed Period `1.000` and Period Random `0.100`
  in this build. Connecting Sequence to Idle cleared missing-child/parent warnings.
  Placing Idle above Sequence produced a separate layout warning; moving it below
  Sequence cleared that warning. This was editor authoring, not AI execution.
- Some native popups are separately targetable windows (`Choose a class`), while
  others are owned transient screenshots (`Variable Edit`). After activation
  failure, enumerate returned windows and inspect the current owner; never assume
  a title has a standalone window or use an undefined handle.

## MCP gaps found

The active server is the local `F:/github/enfusion-mcp-steffen` checkout, on
`main`. Its `origin` is `https://github.com/Nazzgy/enfusion-mcp-steffen.git`;
`upstream` remains `https://github.com/steffenbk/enfusion-mcp-BK.git`.

1. `asset_search` does not index `.bt`; an actual query returned no results.
   Its source allowlist confirms the exclusion. `game_browse` can find them.
2. `game_read` and `project` omit `.bt` from their text allowlists. `game_read`
   reported the animal tree as binary. Reading it through the existing PAK VFS
   showed ordinary Enfusion text beginning with `BehaviorTree`.
3. `wb_open_resource` claims to route to the appropriate editor but its handler
   calls `WorldEditor.SetOpenedResource`. Opening the animal tree returned false,
   yet the handler and TypeScript tool reported success. The native picker opened
   the same tree successfully. Correct routing must check the native result.
4. `BehaviorEditor` declares no dedicated graph-editing API in the installed
   public API. It inherits `WBModuleDef`, including `SetOpenedResource`,
   `GetContainer`, `GetNumContainers`, `Save`, and `ExecuteAction`. An inherited
   API signature does not establish that arbitrary graph changes persist.

## Source interpretation

- Installed game PAKs contain 113 `.bt` files in this snapshot. This is an
  inventory observation, not a permanent expected count.
- In the inspected text, nested `Nodes` blocks encode control flow; `EditorPos`
  stores graph placement. Node labels are not script class names.
- `Variables` declares typed values. `VariablesRefs` contains graph occurrences
  referring to declarations by `VariableType`. The inspected `AttackDelay.bt`
  has one declaration and two references; node ports use both reference indices.
  Do not assume a port integer indexes `Variables` directly.
- `LookAt.bt` demonstrates native input fields (`InEntity`, `InAimAtPosition`).
  `AttackDelay.bt` demonstrates scripted `InPorts` / `OutPorts` with `PortName`
  and `Port` fields. Keep these representations distinct.
- Current generated APIs use `EOnTaskSimulate(AIAgent owner, float dt)`,
  `OnAbort(AIAgent owner, Node nodeCausingAbort)`, and uppercase `ENodeResult`
  constants. Palette visibility and `CanReturnRunning` are static callbacks.
  Prefer current vanilla signatures over the cached wiki's older example code.
- `wiki_read` takes the exact title from `wiki_search`, such as `Behavior Editor`,
  rather than assuming its title is the URL namespace (`Arma Reforger:...`).

## References

- [Official Behavior Editor documentation](https://community.bistudio.com/wiki/Arma_Reforger:Behavior_Editor)
- [Official node documentation](https://community.bistudio.com/wiki/Arma_Reforger:Behavior_Editor:_Nodes)
- Installed API: `Workbench/docs/EnfusionScriptAPI/html/interfaceBehaviorEditor.html`
  and `interfaceWBModuleDef.html` in Arma Reforger Tools.
- Vanilla: `scripts/WorkbenchGame/ResourceManager/SCR_ValidateBehaviorTreesPlugin.c`
  opens `.bt` files using `Workbench.OpenResource`.
- Vanilla: `scripts/Game/generated/AI/{Node,AITaskScripted,DecoratorScripted,ENodeResult}.c`
  and `scripts/Game/AI/ScriptedNodes/Logical/SCR_AITaskTimerGate.c`.

## Delivered changes and observed result

- Added `.bt` to the asset index and a `behavior` search filter, both text-reader
  allowlists, and the shared file-type label map. Updated tool descriptions.
- Added the indexed `Behavior Editor Workflow and MCP` knowledge guide and
  corrected the older behavior-tree guide's data wiring and script signatures.
- Routed `EMCP_WB_EditorControl.openResource` through `Workbench.OpenResource`
  before acquiring WorldEditor. False returns now set error status. The MCP
  response also recognizes rejection messages from old handlers. The route
  blocks `.layout` because of the previously documented LayoutResourceClass crash.
- Built the fork with TypeScript's `tsc -p tsconfig.build.json`; it exited with
  code 0. Reviewed the changes and `git diff --check` reported no whitespace errors.
- Deployed the matching handler into the Stargate addon. Native
  **Script Editor > Build > Validate and Reload Scripts** hit the already-known
  resource-leak assertion (`GameApp.cpp:1287`). It was dismissed using the user's
  existing authorization for that exact assertion. The MCP request timed out
  while the modal was present. The Script Editor subsequently showed zero errors.
- A later normal `wb_open_resource` call for
  `AI/BehaviorTrees/Chimera/Soldier/LookAt.bt` returned the new handler's distinct
  `Workbench accepted resource open` message and visibly opened the correct
  locked tree in Behavior Editor. This establishes that the updated handler was
  loaded and this routing path worked; it does not establish runtime AI behavior.
- A normal `wb_knowledge` call with `Behavior Editor Workflow and MCP` returned
  the new full guide from the fork in this session. If an older process cached
  the KB index before the update, it needs a restart to discover the new entry.
- The scratch Root/Sequence/Idle graph and scalar variable existed only in an
  unsaved tab. Connecting Get to Idle's PeriodKey removed the unused-reference
  warning. The tab was closed without saving. No vanilla tree was changed.
- No tests, test probes, or gameplay were run. At the end of the original study,
  the TypeScript search/read code was built on disk but the running MCP process
  still held the old loaded code/tool schema until restarted.

## Restart follow-up (2026-09-23)

The automated desktop restart attempt did not complete: the helper log recorded
the beginning of shutdown but no relaunch. The user reported manually reopening
Codex. Subsequent process inspection found no remaining restart helper and found
new Enfusion MCP processes. The active tool catalog now advertises behavior-tree
search support. See the restart limitation in [local fork guidance](local-fork.md).

## Manual follow-up

After restarting the MCP server, search `LookAt` with `asset_search` and
`type="behavior"`, read the returned `.bt` with `game_read`, and open it with
`wb_open_resource`. Inspect the title, graph, and Console. Runtime behavior and
negative-path cases are intentionally left for an explicitly requested test pass.
