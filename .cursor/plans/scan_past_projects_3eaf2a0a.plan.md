---
name: Scan Past Projects
overview: Read both project codebases and map visual tokens/design system, pomodoro logic, and customization settings. Provide a side-by-side finding summary and identify concrete gaps.
todos:
  - id: map-pomodoro-files
    content: Catalog `pomodoro-timer` files implementing tokens, timer logic, and settings.
    status: completed
  - id: map-todo-files
    content: Catalog `To-do` files implementing tokens, any pomodoro logic, and customization/persistence.
    status: completed
  - id: report-gaps
    content: Summarize missing or partial pieces for each requested category.
    status: completed
isProject: false
---

# Cross-Project Scan Plan

## Scope

Scan these two projects for:

- Visual design and token system
- Pomodoro logic
- Customization settings (including persistence)

Projects:

- `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer)`
- `[/Users/kyril/Vibe dev/Build your app course/To-do](/Users/kyril/Vibe dev/Build your app course/To-do)`

## Findings Snapshot (from read-only scan)

### 1) `pomodoro-timer`

- **Visual tokens/design:** Strong CSS variable token system in `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/style.css](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/style.css)` with `--pmdr-`* families (colors, spacing, typography, radii, shadows, borders, transitions). Runtime theming/hue updates in `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js)`.
- **Pomodoro logic:** Implemented in `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js)`: mode durations, timer tick, work/break/long-break transitions, controls (`startPause`, `reset`, `switchMode`), and schedule rendering.
- **Customization settings:** Settings UI in `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/index.html](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/index.html)` and behavior in `[/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js](/Users/kyril/Vibe dev/Build your app course/pomodoro-timer/src/main.js)` (durations, interval, hue, shortcuts, lock-while-running).
- **Gap:** No durable settings persistence detected (resets on reload).

### 2) `To-do`

- **Visual tokens/design:** CSS token system in `[/Users/kyril/Vibe dev/Build your app course/To-do/src/style.css](/Users/kyril/Vibe dev/Build your app course/To-do/src/style.css)` with `--todo-`* families; runtime color/theme mutation in `[/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js](/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js)`.
- **Pomodoro logic:** Not found in current app logic/schema (checked `[/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js](/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js)` and `[/Users/kyril/Vibe dev/Build your app course/To-do/supabase/migrations/20260308220312_create_todos_table.sql](/Users/kyril/Vibe dev/Build your app course/To-do/supabase/migrations/20260308220312_create_todos_table.sql)`).
- **Customization settings:** Partial/in-memory theme hooks exist in `[/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js](/Users/kyril/Vibe dev/Build your app course/To-do/src/main.js)`, but settings UI/persistence is incomplete; todo CRUD persistence is implemented via Supabase in `[/Users/kyril/Vibe dev/Build your app course/To-do/src/supabase.js](/Users/kyril/Vibe dev/Build your app course/To-do/src/supabase.js)`.

## Recommended Next Step

If you want, the next pass can be a targeted merge strategy: extract the pomodoro token/theming + timer state machine from `pomodoro-timer` into `To-do`, then add persisted user settings (theme/hue/durations) via local storage or Supabase profile/settings table.