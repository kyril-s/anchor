import { relations } from 'drizzle-orm';
import {
	boolean,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { user } from './auth.schema';

export const dailyTask = pgTable(
	'daily_task',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
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
	},
	(table) => [
		index('daily_task_user_day_idx').on(table.userId, table.day),
		index('daily_task_user_day_title_idx').on(table.userId, table.day, table.title)
	]
);

export const pomodoroSession = pgTable(
	'pomodoro_session',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		taskId: integer('task_id').references(() => dailyTask.id, { onDelete: 'set null' }),
		blockType: text('block_type'),
		flowType: text('flow_type'),
		sessionGroupId: text('session_group_id'),
		repetitionIndex: integer('repetition_index'),
		repetitionTarget: integer('repetition_target'),
		durationMinutes: integer('duration_minutes').notNull(),
		startedAt: timestamp('started_at').notNull(),
		endedAt: timestamp('ended_at'),
		status: text('status').notNull().default('completed'),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [
		index('pomodoro_session_user_day_started_at_idx').on(table.userId, table.day, table.startedAt),
		index('pomodoro_session_user_day_flow_idx').on(table.userId, table.day, table.flowType),
		index('pomodoro_session_session_group_idx').on(table.sessionGroupId)
	]
);

export const dailyNote = pgTable(
	'daily_note',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		content: text('content').notNull().default(''),
		notionPageId: text('notion_page_id'),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull()
	},
	(table) => [uniqueIndex('daily_note_user_day_unique').on(table.userId, table.day)]
);

export const daySession = pgTable(
	'day_session',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		startedAt: timestamp('started_at').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull()
	},
	(table) => [uniqueIndex('day_session_user_day_unique').on(table.userId, table.day)]
);

export const appConfig = pgTable(
	'app_config',
	{
		id: serial('id').primaryKey(),
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
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
	},
	(table) => [uniqueIndex('app_config_user_unique').on(table.userId)]
);

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
