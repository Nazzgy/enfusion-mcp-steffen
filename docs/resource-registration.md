# Repeat-safe resource registration

`wb_resources(action="register")` first resolves the path and asks the native
ResourceManager for metadata. If the resource is already registered, the handler
returns without calling `RegisterResourceFile` again. That native call otherwise
opens an "already registered" modal, blocks the NET API handler and produces a
timeout even though Workbench is still running.

For an existing resource:

- `buildRuntime=false` returns the existing registration.
- `buildRuntime=true` requests a rebuild in the supplied configuration (PC by
  default). The response is a request acknowledgement; native build-log completion
  must still be checked.

Unregistered resources retain the normal native registration path. Metadata is
queried without opening or loading the resource, including imagesets/layouts.
The caller still needs confirmed edit mode for these mutations.

Verified on 2026-11-02 with a registered imageset: two consecutive registration
calls returned immediately without a modal, then registration with runtime build
requested a rebuild that reported `Build successful` in the native log. The
TypeScript build and the existing handler-version/status tests also passed
(12 checks). This verifies the duplicate-registration fix, not every resource
importer or the separate batch-build CLI.
