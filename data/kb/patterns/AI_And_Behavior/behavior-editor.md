# Behavior Editor Workflow and MCP

## Evidence and scope

Observed in Workbench **1.8.0.13 (production)** on 2026-09-22: opening a locked
vanilla tree, menus, node palette, unsaved graph authoring, variable dialogs, and
editor structural warnings. Source evidence comes from installed vanilla scripts,
the installed public Workbench API, and text `.bt` files in the game PAKs.
No game session or automated test was run. Runtime/debug semantics below are
documented behavior, not a claim of live runtime verification.

Behavior Editor edits AI **behavior trees (`.bt`)**. Animation graphs (`.agr`,
`.agf`, `.ast`) and animation workspaces (`.aw`) belong to a different editor and
are not interchangeable resources.

## Discover, read, and open a tree

1. Launch the intended addon explicitly with `wb_launch({gprojPath: ...})`.
   A responding NET API alone does not prove the correct addon is mounted.
2. Search with `asset_search({query: "LookAt", type: "behavior"})`. The local
   fork includes `.bt` in both `behavior` and `any` searches after the September
   2026 update. Older running servers exclude `.bt` entirely; a no-match result
   there does not mean the resource is absent.
3. Browse with `game_browse({path: "AI/BehaviorTrees", pattern: "*.bt"})` and
   descend into its directories. Browsing lists one directory, not a recursive
   search. Example directories: Animals, Chimera/Soldier, Chimera/Group,
   SmartActions, Waypoints.
4. Read vanilla text with `game_read({path: "AI/BehaviorTrees/Chimera/Soldier/LookAt.bt"})`.
   Read mod trees with `project({action: "read", path: "AI/.../MyTree.bt", projectPath: ...})`.
   `.bt` is Enfusion serialized text, not inherently binary. The previous
   game/project text allowlists incorrectly rejected it. Existing size limits
   and path containment checks still apply.
5. Open using `wb_open_resource({path: "AI/BehaviorTrees/Chimera/Soldier/LookAt.bt"})`
   after deploying the updated handler and reloading Workbench scripts. The
   handler uses `Workbench.OpenResource`, following vanilla's
   `SCR_ValidateBehaviorTreesPlugin`. The former WorldEditor-only route returned
   false for `.bt` while reporting success. Check both the returned outcome and
   the actual editor/Console. An accepted open is not proof of a valid tree.

Native fallback, observed: **Resource Manager > Editors > Behavior Editor**, then
**File > Open** (`Ctrl+O`). Search by filename in the resource picker, expand the
addon root when results are collapsed, and double-click the `.bt`. The title/tab
shows the resource path. A padlock identifies a read-only vanilla resource.
Use **Save As** to make a mod-owned copy before changing vanilla content.

The TypeScript server must be rebuilt and restarted to expose changed tools.
Workbench handler deployment/reload is separate. Do not remove project-maintained
MCP scripts with `wb_cleanup` as a routine post-exploration step.

## Native UI and authoring

Observed panels:

| Panel | Purpose |
|---|---|
| Item explorer | Node names and editor node numbers; select to inspect parameters |
| Nodes palette | Searchable native and scripted node classes |
| Variables | Typed declarations; **+ Add variable** opens the class picker |
| Node parameters | Selected node's fields; disabled on locked vanilla trees |
| Resource Browser | Resource browsing tab beside Node parameters |
| Debug / Breakpoints | Runtime instances and breakpoint management |
| Console | Structural diagnostics such as missing parents/children/connections |

**File > New** creates an unsaved `*untitled` tab with Root. It immediately warns
that Root has no children. Creating a document is separate from saving a resource.

Expand a palette category or search for the class. Native examples observed in
Flow include `Selector`, `Sequence`, `Parallel`, `Repeater`, `ForEachChild`,
`RunOnce`, `Switch`, `RunBT`, `RunOnEntity`, `OnEvent`, and `AITaskReturnState`.
Search `Idle` to find `AITaskIdle`; the displayed canvas label is `Idle`.
Palette class names, human labels, and script class names must not be conflated.

Place a node on the canvas, finishing placement with a click if it follows the
cursor. **Connect control flow by dragging the parent's lower black bar to the
child's upper black bar.** Node proximity is not a connection. In the observed
Root-to-Sequence operation, the missing-parent and Root-without-children warnings
disappeared; the empty Sequence warning remained. Inspect the Console after edits
without treating an empty console as proof of correct gameplay behavior.

The editor also warned when a connected child was positioned above its parent.
Moving the child below its parent cleared that warning. This is a native layout
diagnostic; do not infer runtime behavior from it. Selecting a new `AITaskIdle`
showed Period `1.000`, Period Random `0.100`, and a `PeriodKey` data input.

The wheel changes graph zoom. Check the visible percentage before repeating a
scroll. In the computer-use API during this study, positive `scrollY` zoomed out
and negative zoomed in. BIKI documents middle-mouse panning, Shift-drag multi-select,
and double-clicking scripted nodes to open their script.

## Variables and data connections

**+ Add variable** opens **Choose a class**. Observed types include
`BtVariableBool`, `BtVariableEntity`, `BtVariableGroup`, `BtVariableInteger`,
`BtVariableObject`, `BtVariableResourceName`, `BtVariableScalar`, and
`BtVariableString`. `BtVariableScalar` displays as `float` in the Variables list.
**Variable Edit** exposes Name, Description, Input, and Output flags. Flags
describe the tree's interface; creating a declaration does not place a graph node.

Drag a declaration from Variables onto the graph to create a reference. Its
left **Set** pin receives a producer's output; its right **Get** pin supplies a
consumer's input. Data pins are separate from black control-flow bars. An unused
reference produces a `Variable node ... has no connection` console warning.
Several graph references may refer to the same declaration.

In the unsaved exploration graph, connecting a scalar reference's Get pin to
Idle's `PeriodKey` produced a green data wire and removed the unused-reference
warning. This demonstrates editor wiring only; the graph was not executed.

Do not connect two task data ports directly. Route producer output through a
typed variable to the consumer input, and arrange control flow so production
happens before consumption. The existence of a wire alone does not initialize
the value or cause the producer task to run.

## `.bt` serialization contracts

These details were read from shipped `AnimalReactToDanger.bt`, `LookAt.bt`,
`LookAtRandomized.bt`, `AttackDelay.bt`, and `Idle_Observe.bt`:

- Root text class is `BehaviorTree`; `Name` stores a resource path.
- Nested **`Nodes`** blocks represent control-flow hierarchy and child order.
  `EditorPos` stores canvas position. Preserve child ordering when editing.
- **`Variables`** holds typed declarations (`BtVariableEntity`,
  `BtVariableScalar`, `BtVariableVector`, etc.), with `Flags` and `Desc` metadata.
- **`VariablesRefs`** holds canvas instances. A reference's **`VariableType`**
  indexes the declarations. Reference names are not a substitute for indices.
- Node data-port integers refer to **variable references**, not directly to the
  declaration list. `AttackDelay.bt` has one `WaitTime` declaration and two
  references; consumers/producers use both `Port 0` and `Port 1`.
- Native nodes may store bindings as fields, for example `InEntity 0` and
  `InAimAtPosition 1` in `LookAt.bt`. Scripted nodes use `InPorts` / `OutPorts`
  containers with `PortName` and `Port` entries. Preserve exact port names.
- Shipped examples contain `Port -1` for unconnected ports and some omitted
  fields. Do not convert missing fields into explicit zero bindings: omissions
  may represent defaults/inheritance. Let the editor serialize new wiring.
- Multiple references to one declaration are valid. Removing/reordering
  declarations or references requires preserving all dependent indices.
- Respect resource identity/GUID and path references when copying. A file's
  existence does not prove it is registered or its scripts are available.

Use native authoring for graph rewiring where possible. A text parser may help
inspection, but generic `BaseContainer.Set` is not a verified graph edit/undo/save
pipeline. Do not claim persistence without native evidence.

## Current scripted-node contracts

Prefer installed source over the older BIKI sample code:

| Callback / operation | Current form |
|---|---|
| Task simulation | `override ENodeResult EOnTaskSimulate(AIAgent owner, float dt)` |
| Task init/enter | `override void OnInit(AIAgent owner)` / `OnEnter(AIAgent owner)` |
| Task abort | `override void OnAbort(AIAgent owner, Node nodeCausingAbort)` |
| Decorator condition | `override bool TestFunction(AIAgent owner)` |
| Palette visibility | `static override bool VisibleInPalette()` |
| Running support | `static override bool CanReturnRunning()` returning `true` |
| Ports | `override TStringArray GetVariablesIn()` / `GetVariablesOut()` |
| Read / write | `GetVariableIn("PortName", value)` / `SetVariableOut("PortName", value)` |
| Port type | `GetVariableType(true, "InputPort") == float` (returns `typename`) |

Use `ENodeResult.SUCCESS`, `ENodeResult.FAIL`, and `ENodeResult.RUNNING`, with
uppercase spelling. `Node.c` declares palette/running callbacks as static events.
`SCR_AITaskTimerGate.c` demonstrates a running task and its static override.
The owner is the AI agent; use `owner.GetControlledEntity()` when the operation
needs the controlled character. Declare designer parameters with `[Attribute]`.
Preserve port names when renaming scripts because saved trees serialize them.

The cached BIKI examples use old signatures, mixed-case results, and incomplete
sample logic. They are conceptual references, not drop-in current scripts.

## Debugging and menu ownership

Observed native menus/shortcuts:

| Menu action | Shortcut |
|---|---|
| File > Open / Save / Save As | Ctrl+O / Ctrl+S / Ctrl+Shift+S |
| Edit > Undo / Redo | Ctrl+Z / Ctrl+Y |
| Edit > Copy / Cut / Paste | Ctrl+C / Ctrl+X / Ctrl+V |
| Edit > Group / Ungroup | Ctrl+G / Ctrl+Shift+G |
| Debug > Continue / Pause / Toggle Breakpoint | F5 / F10 / F9 |
| Window > Close Tab / Reopen Closed Tab | Ctrl+W / Ctrl+Shift+T |

`wb_execute_action` already accepts `module: "BehaviorEditor"`; WorldEditor is
the default, so always name the owning module. Exact native labels above were
observed, but listing a menu item does not prove MCP dispatch was exercised.
The tool currently requires World Editor edit mode and blocks File > New/Exit.
Consequently it is not a complete Behavior Editor runtime-debug interface. Its
`executed=1` means dispatch was accepted, not that a dialog was completed or a
file saved. `wb_save` and `wb_undo_redo` target **World Editor**, not this graph.

BIKI runtime guidance, not exercised in this study: select the AI instance in the
Debug panel to inspect its running tree and variables. This view is read-only.
Green means Success/assigned, red Fail/unassigned, blue Running, dark red
breakpoint suspension. A behavior-tree breakpoint does not pause the whole game;
other branches below a Parallel ancestor can continue. Edit the source `.bt`.
The native Behavior Editor debug list is distinct from the scripted AI Debug
Panel documented under `AI_DEBUG`.

## API boundary and sources

The public **BehaviorEditor** class has no own graph API. It inherits
`WBModuleDef`: `SetOpenedResource`, `GetContainer`, `GetNumContainers`, `Save`,
`ExecuteAction`, `Close`, `GetCmdLine`, and `GetPlugin`. These signatures do not
establish graph insertion, pin editing, validation, or undo support. No dedicated
MCP graph-editing API is claimed by this update.

- [Behavior Editor](https://community.bistudio.com/wiki/Arma_Reforger:Behavior_Editor)
- [Behavior Editor: Nodes](https://community.bistudio.com/wiki/Arma_Reforger:Behavior_Editor:_Nodes)
- Installed API: `Workbench/docs/EnfusionScriptAPI/html/interfaceBehaviorEditor.html`,
  `interfaceWBModuleDef.html`, `interfaceWorkbench.html`.
- Vanilla: `scripts/WorkbenchGame/ResourceManager/SCR_ValidateBehaviorTreesPlugin.c`.
- Vanilla: `scripts/Game/generated/AI/Node.c`, `AITaskScripted.c`,
  `DecoratorScripted.c`, `ENodeResult.c`.
- Vanilla: `scripts/Game/AI/ScriptedNodes/Logical/SCR_AITaskTimerGate.c`.

For cached docs use `wiki_search`, then pass its exact returned title to
`wiki_read`, e.g. `Behavior Editor`. The search title may omit the URL namespace.

## Observed integration result

The updated `EMCP_WB_EditorControl` compiled/loaded after native script reload.
A subsequent `wb_open_resource` request for `LookAt.bt` returned the new handler's
distinct acceptance message and opened that resource visibly in Behavior Editor.
The fork's TypeScript build succeeded. `wb_knowledge` returned this newly indexed
guide in the same session; an older cached index may still require restart.
The `.bt` search/read changes require restarting the TypeScript MCP process.
No automated tests, runtime AI session, invalid-file checks, or graph persistence
checks were run. The scratch authoring tab was discarded without saving.
