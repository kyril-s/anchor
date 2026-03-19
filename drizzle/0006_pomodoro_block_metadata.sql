ALTER TABLE "pomodoro_session" ADD COLUMN "block_type" text;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "flow_type" text;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "session_group_id" text;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "repetition_index" integer;
--> statement-breakpoint
ALTER TABLE "pomodoro_session" ADD COLUMN "repetition_target" integer;
--> statement-breakpoint
CREATE INDEX "pomodoro_session_user_day_flow_idx" ON "pomodoro_session" USING btree ("user_id","day","flow_type");
--> statement-breakpoint
CREATE INDEX "pomodoro_session_session_group_idx" ON "pomodoro_session" USING btree ("session_group_id");
