ALTER TABLE "daily_task" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "daily_note" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "day_session" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "user_id" text;
--> statement-breakpoint
ALTER TABLE "daily_task" ADD CONSTRAINT "daily_task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD CONSTRAINT "pomodoro_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_note" ADD CONSTRAINT "daily_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "day_session" ADD CONSTRAINT "day_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "app_config" ADD CONSTRAINT "app_config_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_note" DROP CONSTRAINT "daily_note_day_unique";
--> statement-breakpoint
ALTER TABLE "day_session" DROP CONSTRAINT "day_session_day_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_note_user_day_unique" ON "daily_note" USING btree ("user_id","day");
--> statement-breakpoint
CREATE UNIQUE INDEX "day_session_user_day_unique" ON "day_session" USING btree ("user_id","day");
--> statement-breakpoint
CREATE UNIQUE INDEX "app_config_user_unique" ON "app_config" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "daily_task_user_id_idx" ON "daily_task" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "pomodoro_session_user_id_idx" ON "pomodoro_session" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "daily_note_user_id_idx" ON "daily_note" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "day_session_user_id_idx" ON "day_session" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "app_config" ALTER COLUMN "id" DROP DEFAULT;
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "app_config_id_seq";
--> statement-breakpoint
ALTER TABLE "app_config" ALTER COLUMN "id" SET DEFAULT nextval('"app_config_id_seq"');
--> statement-breakpoint
SELECT setval('"app_config_id_seq"', COALESCE((SELECT MAX("id") FROM "app_config"), 1), true);
