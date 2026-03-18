### 1. What I’m building

I tend to get quite distracted by 5 different apps and tabs and there is always a possibility that I will forget what I was going to do mid-way. I'd like to build a bit of a hub that is connected to Notion (history tracking to see patterns in my behavior). 

### 2. Core features

- (Migrate and connect) Pomodoro timer
- (Migrate and connect) To-do for the day
    - Option to move it to the next day if not finished
- Quick “notepad” for idea dump
- Connected to Notion DBs via API
- Each needs a setup to connect to specific DB ID
- Reading list (Name/ Type(Article/Book)/ Status/ Link)

### 3. What I’m not building

- Detailed task board with statuses, progress tracking etc (I will use Notion for that)

### 4. Tech stack

HTML, CSS, and JavaScript — The building blocks of every web interface
Design tokens and UI structure — Building design systems from the code up, not the mockup down
Git and GitHub — Version control, branching, committing, pushing
Deployment on Netlify — Getting a working app live on the internet
Databases — Supabase (hosted Postgres) 
Authentication — Supabase Auth and Better Auth for user accounts and data isolation
Svetle — Components, file-based routing, server-side data loading
Working with LLMs — Prompting Cursor effectively, planning before building, knowing when to dig in vs. move on
Notion - connection for analyics


### 5. Nice-to-haves

1. Extension of Pomodoro timer: 
    - Flexible and customizable timer sessions (For example: 5 min for 1 task → 8 min for different task etc), that supports adding/removing and naming timers as needed
2. Embed spotify UI with a specific playlist ? (Not sure how this works, will need to investigate a bit) - Ideally play/stop for a specific playlist
3. Habit tracker but it's very blurry for now, need a bit of discovery
4. Installable desktop app for macos using Tauri