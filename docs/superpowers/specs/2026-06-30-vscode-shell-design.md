# WIMPS VS Code Shell Design

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** Reframe the IDE chrome to feel like desktop VS Code while preserving the existing simulator/editor behavior and keeping WIMPS branding/colors.

## Problem

Professor feedback is mainly about the IDE controls and overall familiarity, not the core simulator. The current shell reads as a custom web app:

1. Buttons are too prominent and app-like, especially in the simulator toolbar
2. The frame does not immediately read as a familiar editor environment
3. Tabs, panels, and spacing are looser than VS Code, so the product feels less dense and less tool-like
4. The current explorer/sidebar is acceptable, but the overall chrome needs stronger VS Code cues

## Goal

When a user opens WIMPS, it should read as "VS Code-like IDE for MIPS" within a few seconds, while keeping simulator actions explicit enough for a classroom environment.

## Chosen Direction

Use a **desktop VS Code-like shell** as the base:

- Compact title/menu strip at the top
- Dense left activity bar as the primary frame anchor
- Explorer/sidebar visible and compact
- File tab strip directly under the title strip
- Simulator controls in a compact row below the tab strip
- Bottom status bar for persistent state and editor context

This is intentionally a **shell clone, not a workflow clone**. The first pass should improve recognition and polish without rebuilding the product into a full VS Code behavioral copy.

## Design

### 1. Frame Layout

The first-pass IDE layout should be:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Title / menu strip                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Activity │ Sidebar / Explorer │ Editor tab strip                            │
│ bar      │                    ├──────────────────────────────────────────────┤
│          │                    │ Compact simulator command row               │
│          │                    ├──────────────────────────────────────────────┤
│          │                    │ Editor                                      │
│          │                    ├──────────────────────────────────────────────┤
│          │                    │ Console / lower panel                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ Status bar                                                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- The title strip should visually resemble a desktop editor shell, not a marketing navbar
- The activity bar stays on the far left and remains the main navigation anchor
- The sidebar remains present and compact; no major explorer logic rewrite in this pass
- The editor tab strip should feel denser and more VS Code-like
- The simulator command row stays separate from the title/menu strip so the teaching workflow remains obvious
- The bottom status bar becomes the persistent home for IDE state cues

### 2. Control Hierarchy

Keep simulator actions explicit, but make them read like editor chrome rather than product CTA buttons.

Primary behavior:

- `Assemble` remains the main action and stays text-labeled
- `Run`, `Step`, `Step Back`, and `Reset` remain visible and labeled
- Secondary actions should be denser, lower-emphasis, and more toolbar-like
- Save/import/export/docs/theme actions should move out of the simulator row and into top chrome areas

Visual hierarchy:

- `Assemble` gets the strongest emphasis in the simulator row
- Other simulator actions use smaller, tighter button treatments with icon + short label
- Disabled states remain obvious, but should look like editor toolbar states rather than big disabled app buttons
- Toolbar height, padding, and border weight should all shrink

### 3. Styling Direction

Keep the existing color identity mostly intact. The redesign should come from **density and chrome treatment**, not from repainting the app into stock VS Code colors.

Styling rules:

- Preserve the current dark/light theme family
- Tighten spacing throughout tabs, headers, toolbars, and panels
- Reduce button height and horizontal padding
- Reduce border heaviness and visual noise
- Make tab chrome flatter and denser
- Use compact all-caps or subdued section headers where appropriate in the sidebar
- Let the blue accents continue to signal active/focused state

### 4. Status Presentation

Add a real bottom status bar and move persistent state there.

The status bar should carry cues such as:

- simulator state (`Not assembled`, `Assembled`, `Running`, `Error`)
- current file or mode
- editor position / context if available

This reduces dependence on large pills inside the simulator row. The simulator row may keep a compact inline status chip, but the bottom status bar is the primary persistent status surface.

### 5. Sidebar and Activity Bar

The existing sidebar direction is good enough for this pass. Improve polish rather than re-architecting behavior.

Changes in scope:

- tighter activity bar spacing
- stronger active state styling
- denser explorer/sidebar header treatment
- better visual integration between activity bar, sidebar, and editor area

Changes out of scope:

- major explorer interaction changes
- folder tree behavior rewrite
- new explorer capabilities

### 6. Tabs and Editor Chrome

The file tab strip should be one of the strongest VS Code cues.

First-pass changes:

- make tabs shorter and denser
- reduce extra padding and border weight
- keep active tab visually connected to the editor surface
- demote inactive tabs slightly
- ensure the tab row reads as editor chrome, not generic pills

Optional but in-scope polish:

- light breadcrumb treatment above the editor or below tabs if it fits naturally

### 7. Out of Scope

Do not expand this redesign into a general product rewrite.

Out of scope:

- command palette
- full VS Code shortcut model
- major file explorer behavior changes
- deep simulator behavior changes
- large color-system rewrite
- replacing the current product identity with Microsoft branding

## Files Likely to Change

- `src/pages/IdePage.tsx`
- `src/global.css`
- `src/components/ActionIcons.tsx`
- `src/components/FileExplorer.tsx`
- `src/components/SaveStatus.tsx`
- `src/components/ThemeSwitch.tsx`

Exact file list may narrow during planning if some existing components can be left untouched.

## Implementation Strategy

Use the smallest diff that changes the shell first:

1. Restructure the frame chrome in `IdePage`
2. Tighten toolbar and tab styling
3. Introduce the bottom status bar
4. Polish activity bar/sidebar visuals
5. Leave explorer internals and simulator logic alone unless they block the shell update

This keeps the work focused on the professor's feedback: familiarity, buttons, and overall IDE feel.
