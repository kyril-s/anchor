CREATE INDEX "daily_task_user_day_idx" ON "daily_task" USING btree ("user_id","day");
--> statement-breakpoint
CREATE INDEX "daily_task_user_day_title_idx" ON "daily_task" USING btree ("user_id","day","title");
--> statement-breakpoint
CREATE INDEX "pomodoro_session_user_day_started_at_idx" ON "pomodoro_session" USING btree ("user_id","day","started_at");
