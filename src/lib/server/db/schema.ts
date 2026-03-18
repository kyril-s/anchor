import { relations } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const dailyTask = pgTable('daily_task', {
	id: serial('id').primaryKey(),
	day: text('day').notNull(),
	title: text('title').notNull(),
	done: boolean('done').notNull().default(false),
	carriedOver: boolean('carried_over').notNull().default(false),
	notionPageId: text('notion_page_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const pomodoroSession = pgTable('pomodoro_session', {
	id: serial('id').primaryKey(),
	day: text('day').notNull(),
	taskId: integer('task_id').references(() => dailyTask.id, { onDelete: 'set null' }),
	durationMinutes: integer('duration_minutes').notNull(),
	startedAt: timestamp('started_at').notNull(),
	endedAt: timestamp('ended_at'),
	status: text('status').notNull().default('completed'),
	createdAt: timestamp('created_at').defaultNow().notNull()
});

export const dailyNote = pgTable('daily_note', {
	id: serial('id').primaryKey(),
	day: text('day').notNull().unique(),
	content: text('content').notNull().default(''),
	notionPageId: text('notion_page_id'),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const appConfig = pgTable('app_config', {
	id: integer('id').primaryKey().default(1),
	notionApiKey: text('notion_api_key'),
	tasksDbId: text('tasks_db_id'),
	notesDbId: text('notes_db_id'),
	taskFieldMapJson: jsonb('task_field_map_json').$type<Record<string, string>>().notNull().default({}),
	noteFieldMapJson: jsonb('note_field_map_json').$type<Record<string, string>>().notNull().default({}),
	uiSettingsJson: jsonb('ui_settings_json').$type<Record<string, unknown>>().notNull().default({}),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull()
});

export const dailyTaskRelations = relations(dailyTask, ({ many }) => ({
	sessions: many(pomodoroSession)
}));

export const pomodoroSessionRelations = relations(pomodoroSession, ({ one }) => ({
	task: one(dailyTask, {
		fields: [pomodoroSession.taskId],
		references: [dailyTask.id]
	})
}));

export * from './auth.schema';
