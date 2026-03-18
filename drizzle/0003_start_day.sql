CREATE TABLE "day_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "day_session_day_unique" UNIQUE("day")
);
