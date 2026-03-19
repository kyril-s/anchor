---
name: Persist main tab in URL
overview: Persist the selected main tab (`my-day`/`timers`) via a `tab` query parameter so refresh and deep links keep the same tab without splitting into separate routes.
todos:
  - id: add-tab-url-helpers
    content: Add tab query parse/validate/write helpers in `src/routes/+page.svelte`
    status: completed
  - id: wire-active-tab-init
    content: Initialize `activeTab` from URL with safe fallback for SSR/browser contexts
    status: completed
  - id: refactor-tab-clicks
    content: Route tab button click handlers through a shared setter that syncs URL
    status: completed
  - id: add-popstate-sync
    content: Listen to `popstate` and keep `activeTab` synchronized with URL changes
    status: completed
  - id: verify-behavior
    content: Run a quick manual behavior check for refresh, invalid params, and back/forward
    status: completed
isProject: false
---

# Persist Main Tab Via Query Param

## Goal

Keep the app on the same tab after refresh by encoding tab state in the URL (`/?tab=my-day` or `/?tab=timers`) while staying on the existing `+page.svelte` route.

## Scope

- Update tab initialization and tab-change URL sync in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.svelte](/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.svelte)`
- No route split, no server-side API changes, no DB changes

## Implementation

- Add small helpers for tab URL handling:
  - Parse `tab` from `window.location.search`
  - Validate against `MainTab` and fallback to `'my-day'`
- Initialize `activeTab` from URL in browser context; fallback to current default for non-browser/SSR safety.
- Replace inline tab assignment with a `setActiveTab(tab: MainTab)` helper that:
  - updates `activeTab`
  - writes `tab` into URL query
- Use `history.replaceState` for URL updates so tab switching does not create a long back-stack.
- Add `popstate` sync so browser Back/Forward updates `activeTab` from URL.

## Why This Is Clean

- Single source of truth is the URL for view state
- Refresh/deep-link works naturally
- Keeps existing one-page UX and avoids route duplication
- Minimal, local change surface in one file

## Validation

- Open `/` (no `tab`) => defaults to `my-day`
- Switch to Timers => URL becomes `/?tab=timers`
- Refresh on Timers => stays on Timers
- Use Back/Forward with tab changes => UI tracks URL
- Invalid `tab` (e.g. `/?tab=foo`) => falls back to `my-day`

