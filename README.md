# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.12.8 create --template minimal --types ts --add sveltekit-adapter="adapter:netlify" drizzle="database:postgresql+postgresql:neon" better-auth="demo:password" --install pnpm .
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Anchor MVP setup

### 1) Database

Run migrations:

```sh
pnpm db:migrate
```

### 2) Start app

```sh
pnpm dev
```

### 3) Configure Notion in-app

On the root `Anchor` page, open **Notion Settings** and provide:

- your Notion secret key
- your Tasks database ID
- your Notes database ID
- field mapping names (Anchor fields -> Notion property names)

Then click **Save Notion settings** and **Sync now**.

### Optional env fallback

You can define `NOTION_API_KEY`, `NOTION_TASKS_DB_ID`, and `NOTION_NOTES_DB_ID` in `.env` as local defaults. The app still supports user-provided settings from the UI.
