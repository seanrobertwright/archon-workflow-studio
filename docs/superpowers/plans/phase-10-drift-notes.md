# Phase 10 drift notes — plan vs. codebase reality

Mirror of `phase-9-drift-notes.md`. Each entry records where the executed
code diverges from the written plan and why.

**Phase summary:** 558 tests (527 core + 22 api-archon + 9 standalone). +9 from Phase 9's
549 baseline. Bundle unchanged. No new runtime packages.

---

## Drift 10.1 — `apps/standalone` needs `bunfig.toml` preload, not just `beforeAll`

**Plan assumed:** adding `GlobalRegistrator.register()` in a `beforeAll()` hook would be
sufficient, mirroring the pattern seen in individual `packages/studio-core` test files.

**Reality:** `@testing-library/dom`'s `screen` object captures `document` at **module load
time**, not at first-test time. By the time `beforeAll` fires, the module has already been
imported and `document` is undefined. Result: all 4 ConnectPage tests failed with
"For queries bound to document.body a global document has to be available."

The correct pattern (already used by `packages/studio-core`) is a `bunfig.toml` that
preloads a `tests/setup.ts` file which runs `GlobalRegistrator.register()` before any
test module is imported.

Fix: created `apps/standalone/bunfig.toml` and `apps/standalone/tests/setup.ts` (same
content as the core preload — GlobalRegistrator + CSS stub + ResizeObserver stub).

**How to apply:** any new package that adds React component tests needs its own
`bunfig.toml` preload pointing to a `setup.ts` that registers happy-dom before
`@testing-library/dom` is imported.

---

## Drift 10.2 — `packages/studio-api-archon` has no `typecheck` script

**Plan assumed:** both `@archon-studio/core` and `@archon-studio/api-archon` had a
`typecheck` script, and the CI step could reference them symmetrically.

**Reality:** `@archon-studio/api-archon/package.json` has only `build` and `test` scripts —
no `typecheck`. The `build` script runs `tsc --noEmit` so typecheck is covered implicitly
by the build step. The CI change only adds `bun --filter='@archon-studio/core' run typecheck`
(which has a dedicated script) rather than adding a separate api-archon typecheck step.

**How to apply:** if `@archon-studio/api-archon` ever splits `build` from `typecheck`, add
a matching CI step. For now, `build` covers it.

---

## Drift 10.3 — Root `README.md` already existed

**Plan assumed:** `README.md` needed to be created from scratch.

**Reality:** a root `README.md` already existed from Phase 0 (43 lines, covering standalone
mode, Phase 2 quickstart, repo layout, contributing notes). The plan's "create" was changed
to "update" — the existing content was preserved and the Status section was updated to
reflect v0.9.0 and the current feature set.

**How to apply:** always check for an existing file before treating a plan's "Create" step
as a blank-slate write.

---

## Drift 10.4 — `packages/studio-core` and `packages/studio-api-archon` are `"private": true`

**Plan assumed:** bumping to `0.9.0` + adding `publishConfig: { access: 'public' }` would
prepare the packages for npm publish.

**Reality:** both packages have `"private": true` in `package.json`, which prevents npm
publish regardless of `publishConfig`. Since publishing to npm is not the immediate goal
(the standalone app is the consumer), `publishConfig` was omitted and only the version
was bumped to `0.9.0` as a semantic marker.

**How to apply:** if future plans call for npm publishing, first remove `"private": true`
and then add `publishConfig`. Don't add `publishConfig` to private packages.

---

## Summary

4 entries. Two are "plan said create, reality said update" — common drift category
when plans are written against a partially-executed codebase. One (bunfig preload) is
a genuine test-infrastructure gotcha worth remembering. The happy-dom capture-at-import
rule is now documented in both the drift notes and the `tests/setup.ts` comment.

Live smoke gate remains deferred pending a live Archon connection.
