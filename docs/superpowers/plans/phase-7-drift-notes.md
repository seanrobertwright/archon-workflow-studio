# Phase 7 drift notes — plan vs. codebase reality

Mirror of `phase-6-drift-notes.md`. Each entry records where the executed
code diverges from the written plan and why.

---

## Drift 7.0 — package name in test filters

**Plan assumed:** `bun --filter='@archon-studio/studio-core' run test`.

**Reality:** the workspace package is `@archon-studio/core`. The
`studio-core` directory name does not match the package name in
`package.json`. All Task 7.x agents ran with `--filter='@archon-studio/core'`.

**How to apply:** any future plan should grep `package.json` for the
actual package name rather than inferring it from the directory.

---

## Drift 7.3.1 — `EditorState.readOnly.of(true)` does not toggle contenteditable

**Plan assumed:** `readOnlyExt()` returning just `EditorState.readOnly.of(true)`
would make `.cm-content[contenteditable="false"]` for the render test in
`YamlPreview.spec.tsx`.

**Reality:** `EditorState.readOnly` blocks programmatic edits but leaves
`contenteditable="true"` in the DOM. A truly read-only CM6 editor needs
**both** facets:

```ts
export function readOnlyExt(): Extension {
  return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
}
```

**How to apply:** when a future task wants "read-only," install both
`EditorState.readOnly` and `EditorView.editable.of(false)`.

---

## Drift 7.3.2 — CSS Modules mangle class names that CM6 emits

**Plan assumed:** `YamlPreview.module.css` with `.cm-yaml-selected` and
`.cm-yaml-hovered`, imported as a side-effect, would style the
`Decoration.line({ class: 'cm-yaml-selected' })` injected by the
highlight field.

**Reality:** CSS Modules mangle the class names so the build emits
`.YamlPreview_cm-yaml-selected__hash` while CM6 emits the literal
`cm-yaml-selected`. The styles never match.

Fix: wrap the rules in `:global(...)` so CSS Modules leaves the names
alone:

```css
:global(.cm-yaml-selected) { ... }
:global(.cm-yaml-hovered)  { ... }
```

**How to apply:** any class name that travels from JS to DOM as a
literal string (CM6 decorations, third-party-library injected classes)
must either live in a plain `.css` file or use `:global(...)` inside a
`.module.css`.

---

## Drift 7.4.1 — `loadWorkflow` had no existing resets to preserve

**Plan suggested:** seed `baselineYaml` and "...existing resets (selectedNodeId, etc.)".

**Reality:** the pre-Phase-7 `loadWorkflow` was a minimal one-liner:
`set({ workflow: meta, nodes })` — no resets. We did not invent any.
We **did** extend `clearWorkflow` to also null `baselineYaml`,
`hoveredNodeId`, and `isYamlPreviewOpen` for clean-state semantics,
because `clearWorkflow` already had resets and the new transient state
belongs to the clean slate.

**How to apply:** when the plan references "existing X" check the
actual code; don't add what isn't there.

---

## Drift 7.5.1 — `StubArchonApiClient` does not exist

**Plan assumed:** integration tests construct `new StubArchonApiClient()`.

**Reality:** the codebase has no such class. `WorkflowBuilder.spec.tsx`
and `validation-flow.spec.tsx` define an **inline** `noopClient` typed
as `WorkflowApiClient` from `../../src/api/WorkflowApiClient`. Phase 7
tests followed that pattern.

**How to apply:** when wiring component tests that need an API client,
copy the inline `noopClient` shape from an existing spec — there is
no shared stub.

---

## Drift 7.6.1 — Bun 1.3.8 `mock.module` is process-wide, not file-scoped

**Plan assumed:** dropping a `mock.module('@xyflow/react', …)` into a new
`Canvas.hover.spec.tsx` file would only affect that file.

**Reality:** when `bun test` runs the whole suite, `mock.module` calls
register process-wide. The new spec's mock bled into
`tests/components/Canvas.spec.tsx`, causing two pre-existing tests
to fail.

Workaround taken: option B from the plan — write the hover test using
a store round-trip (call `setHoveredNodeId('x')` directly, assert the
store updates) plus a structural assertion that `Canvas.tsx` source
contains `onNodeMouseEnter` and `onNodeMouseLeave`. Weaker than a
fired-handler test, but combined with the existing real-DOM Canvas
tests for the rest of the component, it's sufficient.

**How to apply:** prefer real-DOM tests in this repo. If `mock.module`
is unavoidable, isolate it in a tiny dedicated test file and
investigate whether moving to `bun test --preload` scoping fixes the
leak. Until then, treat `mock.module` as global.

---

## Drift 7.7.1 — bun-test does not auto-cleanup React DOM between files

**Plan assumed:** each test file would naturally render in isolation.

**Reality:** Bun's test runner does not auto-call
`@testing-library/react`'s `cleanup()` after each test, so previously
rendered roots remain in the JSDOM document. When two specs render
the same component the second one sees "found multiple elements"
errors.

The project convention (visible in `Canvas.spec.tsx`,
`WorkflowBuilder.spec.tsx`, others) is to add
`afterEach(() => cleanup())` to every React spec. Phase 7 followed
this in `YamlPreviewDrawer.spec.tsx`, `Toolbar.spec.tsx` additions,
and `yaml-preview.e2e.spec.tsx`.

**How to apply:** every React component spec needs an explicit
`afterEach(() => cleanup())`.

---

## Drift 7.8.1 — Zustand's module-level `initial` snapshot leaks transient UI state

**Plan assumed:** `beforeEach(() => useBuilderStore.setState(initial, true))`
would isolate tests from each other.

**Reality:** `const initial = useBuilderStore.getState()` is captured at
module-load time. If test A runs first and sets `isYamlPreviewOpen: true`
without an `afterEach` reset, then by the time test B's spec module
loads its own `initial = useBuilderStore.getState()`, that "initial" now
includes `isYamlPreviewOpen: true`. Test B's "defaults to false"
assertion then fails.

Pattern: every spec that mutates the Phase-7 transient slice
(`isYamlPreviewOpen`, `hoveredNodeId`) must reset it in `afterEach` —
even if `beforeEach` resets via the snapshot.

**How to apply:** for any zustand slice that represents transient UI
state (drawer toggles, hover targets, focus rings), reset explicitly
in `afterEach`, not just `beforeEach`.

---

## Drift 7.9.1 — Manual smoke caught three real bugs the test suite missed

The user ran the 11-step smoke against the running dev server.
Steps 1, 3, 4, 5, 6, 8, 9, 11 passed on the first build. **Three real bugs
surfaced that no automated test caught**, each shipped in its own
follow-up commit:

### Bug A — no syntax highlighting in the preview (commit `de70e4b`)

`@codemirror/lang-yaml` ships only the parser/tokenizer, not a highlight
style. Without `syntaxHighlighting(defaultHighlightStyle, { fallback: true })`
from `@codemirror/language`, CM6 produces tokens but paints them in the
default foreground color — looks like plain monospace text.

Fix: added the missing extension to `previewBaseExtensions()` and added
`@codemirror/language@^6` as a direct dep (it was not hoisted from
`lang-yaml`).

**How to apply:** any future CM6 surface that wants colored syntax must
install BOTH a language extension AND a highlight-style extension.
"Lang-only" is not enough.

### Bug B — drawer layout broken: no scroll, buttons unstyled (commit `de70e4b`)

The plan referenced className strings like `yaml-preview-drawer`,
`yaml-preview-drawer__header`, `yaml-preview-drawer__actions` but never
provided CSS for them. The drawer rendered as unstyled inline flow:
"CopyDownload" ran together with no separator, the editor host had no
height constraint so the right column overflowed without a scrollbar.

Fix: created `YamlPreviewDrawer.css` (plain `.css`, side-effect import)
with a flex column layout — header `flex: 0 0 auto`, editor host
`flex: 1 1 auto` with `min-height: 0`, `.cm-scroller` set to `overflow: auto`,
header gets padding + button gaps + h2 sizing.

**How to apply:** when a plan invents className strings, verify the CSS
is also part of the deliverable. The Phase-7 plan provided the JSX but
implicitly left styling "tiny on purpose" — that left a hole.

### Bug C — Ctrl+F opens browser search, not CM6 search panel (commit `8a9e1c9`)

`EditorView.editable.of(false)` sets `contenteditable="false"` on
`.cm-content`. As a side effect, that element also drops out of the tab
order — so a click on the preview does not focus the editor, and
keydown events never reach the installed `searchKeymap`. Ctrl+F bubbles
to the browser's native find.

Fix: `EditorView.contentAttributes.of({ tabindex: '0' })` restores
focusability without making the surface editable.

**How to apply:** any read-only-but-still-keyboard-driven CM6 view needs
explicit `tabindex` on `.cm-content`. The combo "readOnly + non-editable
+ keymap" requires three facets, not two.

### Meta-lesson

Three bugs survived 440 automated tests because they're all UX-layer
issues that JSDOM-rendered tests don't surface:

- JSDOM does not paint, so missing colors aren't visible.
- Grid/flex layout breakage doesn't fail assertions unless you measure
  layout (which we don't).
- Browser keystrokes vs editor keystrokes — JSDOM doesn't run a real
  event loop where Ctrl+F competes with the browser.

**How to apply:** treat the manual smoke as load-bearing for any
visual-or-keyboard-input feature, not as a nice-to-have. Phase 8's
undo/redo, theme picker, multi-select will all need the same gate.

After fixes: all 11 smoke steps pass. 440/440 automated tests still
green.

---

## Summary

8 entries. Most are environment-quirk discoveries (Bun mocks, CSS
Modules, JSDOM cleanup, Zustand snapshot timing) rather than
architectural deviations. The plan's architecture survived intact:
pure `serializeYaml` + `StateField`-driven decorations + single-occupancy
inspector slot worked exactly as specified.
