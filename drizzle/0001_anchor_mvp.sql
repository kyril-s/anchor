CREATE TABLE "app_config" (
	"id" integer DEFAULT 1 PRIMARY KEY NOT NULL,
	"notion_api_key" text,
	"tasks_db_id" text,
	"notes_db_id" text,
	"task_field_map_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note_field_map_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_note" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"notion_page_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_note_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "daily_task" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"carried_over" boolean DEFAULT false NOT NULL,
	"notion_page_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pomodoro_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"task_id" integer,
	"duration_minutes" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_task_id_daily_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."daily_task"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
DROP TABLE "task";
