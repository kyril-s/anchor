---
name: start_day_feature
overview: Add a real per-day Start Day flow with prompt-first interaction, persistent started state, and reset behavior that clears dump + resets Pomodoro settings to defaults.
todos:
  - id: add-day-session-schema
    content: Add day session table and migration for per-day started state logging
    status: completed
  - id: implement-start-day-action
    content: Implement server load + startDay action with note clear, defaults reset, optional yesterday->today carry-over
    status: completed
  - id: add-start-day-ui
    content: Add top-nav Start Day icon button with pressed state and prompt-first submission flow
    status: completed
  - id: verify-start-day-flows
    content: Validate idempotency, toast messaging, and day rollover behavior
    status: completed
isProject: false
---

# Start Day Feature Plan

## Scope

Implement a new `Start Day` control next to Settings with sun/moon icon behavior, where clicking it first prompts to move unfinished tasks to today, then marks the day as started and keeps the button active for that date.

## Existing Code To Leverage

- Page UI + timer/session state in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.svelte](/Users/kyril/Vibe dev/Build%20your%20app%20course/anchor-app/src/routes/+page.svelte)`
- Server actions and day-based load in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.server.ts](/Users/kyril/Vibe dev/Build%20your%20app%20course/anchor-app/src/routes/+page.server.ts)`
- DB schema in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/lib/server/db/schema.ts](/Users/kyril/Vibe dev/Build%20your%20app%20course/anchor-app/src/lib/server/db/schema.ts)`

## Data Model Changes

- Add a new table (e.g. `day_session`) in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/lib/server/db/schema.ts](/Users/kyril/Vibe dev/Build%20your%20app%20course/anchor-app/src/lib/server/db/schema.ts)`:
  - `id` PK
  - `day` text unique/not null
  - `startedAt` timestamp not null
  - `createdAt` timestamp default now
- Create matching Drizzle migration in `[/Users/kyril/Vibe dev/Build your app course/anchor-app/drizzle](/Users/kyril/Vibe%20dev/Build%20your%20app%20course/anchor-app/drizzle)`.

Rationale: this gives a proper persistent "day started" flag plus a timestamp log of when Start Day was pressed.

## Server-Side Changes

In `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.server.ts](/Users/kyril/Vibe%20dev/Build%20your%20app%20course/anchor-app/src/routes/+page.server.ts)`:

- Extend `load` to include `dayStarted` (lookup by `today`) and optionally `dayStartedAt`.
- Add a new action `startDay` that:
  - accepts `day` (defaults to today)
  - idempotently records day start (insert if missing)
  - clears today’s note (`dailyNote` content -> `''` via upsert/update)
  - resets persisted Pomodoro UI settings to defaults (`DEFAULT_UI_SETTINGS`)
  - optionally moves unfinished tasks from yesterday to today if `moveUnfinished=true`
    - reuse and adapt current `carryUnfinished` logic (source day = yesterday, target day = today)
  - returns toast message describing what was reset/moved.
- Add small helper `getYesterdayDateString()` (parallel to `getTomorrowDateString`).

## UI / Interaction Changes

In `[/Users/kyril/Vibe dev/Build your app course/anchor-app/src/routes/+page.svelte](/Users/kyril/Vibe%20dev/Build%20your%20app%20course/anchor-app/src/routes/+page.svelte)`:

- Add a new icon button next to Settings (sun/moon icon), styled as toggle/pressed when `data.dayStarted` is true.
- Behavior for click:
  - If already started: no prompt, no-op (button remains active).
  - If not started: open a small confirmation prompt/modal with move option:
    - Prompt: move unfinished tasks from yesterday to today?
    - Actions: `Start Day + Move`, `Start Day Only`, `Cancel`
  - Submit to `?/startDay` with hidden fields `day`, `moveUnfinished`.
- After action success, keep button visually pressed for current date (from refreshed `load` data).
- Preserve existing toast mechanism (`form?.message`).

## Timer Reset Details On Start Day

On successful `startDay`, timer behavior will reset as part of default settings application:

- persisted UI settings reset to defaults (25/5/25/4 + default hue)
- local timer state should reflect defaults after reload:
  - idle status
  - work mode
  - default remaining time
  - session draft cleared
- The day automatically ends at 23:59

## Carry-Over Adjustment

- Keep existing manual `Move unfinished to tomorrow` action unchanged unless explicitly removed later.
- Add distinct Start Day carry-over path: yesterday -> today via `startDay` prompt choice.

## Validation / Edge Cases

- Re-clicking Start Day on the same date should not duplicate day-start rows or re-trigger prompt.
- If no unfinished tasks exist yesterday and user chose move, return a warning-style message (`No tasks were moved.` compatible with current toast tone logic).
- Ensure clearing note creates/updates today’s note safely even when row doesn’t exist.

## Verification

- Start Day unstarted -> prompt appears -> choose Move: tasks copied, note cleared, settings reset, button active.
- Start Day unstarted -> choose Start Only: note/settings reset, no carry-over.
- Refresh page: button still active for that date.
- Click active button: no prompt, no duplicate effects.
- Next day: button inactive again (new `today`), prompt flow available again.

