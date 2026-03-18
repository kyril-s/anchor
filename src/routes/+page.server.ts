import { fail } from '@sveltejs/kit';
import { and, asc, desc, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { appConfig, dailyNote, dailyTask, pomodoroSession } from '$lib/server/db/schema';
import {
	normalizeNoteFieldMap,
	normalizeTaskFieldMap,
	syncDailyNoteToNotion,
	syncDailyTaskToNotion
} from '$lib/server/notion';
import type { Actions, PageServerLoad } from './$types';

const APP_CONFIG_ID = 1;

function getTodayDateString() {
	return new Date().toISOString().slice(0, 10);
}

function getTomorrowDateString(dateString: string) {
	const date = new Date(`${dateString}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function getString(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

function getNumber(formData: FormData, key: string) {
	const value = Number(getString(formData, key));
	return Number.isFinite(value) ? value : NaN;
}

function getBoolean(formData: FormData, key: string) {
	return getString(formData, key) === 'true';
}

async function getOrCreateConfig() {
	const existing = await db.query.appConfig.findFirst({ where: eq(appConfig.id, APP_CONFIG_ID) });
	if (existing) return existing;

	await db.insert(appConfig).values({ id: APP_CONFIG_ID });
	const created = await db.query.appConfig.findFirst({ where: eq(appConfig.id, APP_CONFIG_ID) });
	if (!created) throw new Error('Failed to initialize app configuration');
	return created;
}

export const load: PageServerLoad = async () => {
	const today = getTodayDateString();
	const [tasks, note, sessions, config] = await Promise.all([
		db.query.dailyTask.findMany({ where: eq(dailyTask.day, today), orderBy: [asc(dailyTask.id)] }),
		db.query.dailyNote.findFirst({ where: eq(dailyNote.day, today) }),
		db.query.pomodoroSession.findMany({
			where: eq(pomodoroSession.day, today),
			orderBy: [desc(pomodoroSession.startedAt)],
			limit: 20
		}),
		getOrCreateConfig()
	]);

	const normalizedTaskMap = normalizeTaskFieldMap(config.taskFieldMapJson);
	const normalizedNoteMap = normalizeNoteFieldMap(config.noteFieldMapJson);

	return {
		today,
		tasks,
		note: note?.content ?? '',
		sessions,
		notionConfig: {
			hasApiKey: Boolean(config.notionApiKey || env.NOTION_API_KEY),
			tasksDbId: config.tasksDbId ?? env.NOTION_TASKS_DB_ID ?? '',
			notesDbId: config.notesDbId ?? env.NOTION_NOTES_DB_ID ?? '',
			taskFieldMap: normalizedTaskMap,
			noteFieldMap: normalizedNoteMap
		}
	};
};

export const actions: Actions = {
	addTask: async ({ request }) => {
		const formData = await request.formData();
		const title = getString(formData, 'title');
		const day = getString(formData, 'day') || getTodayDateString();

		if (!title) return fail(400, { message: 'Task title is required.' });

		await db.insert(dailyTask).values({ title, day });
		return { message: 'Task added.' };
	},

	updateTask: async ({ request }) => {
		const formData = await request.formData();
		const id = getNumber(formData, 'id');
		const title = getString(formData, 'title');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });
		if (!title) return fail(400, { message: 'Task title is required.' });

		await db.update(dailyTask).set({ title }).where(eq(dailyTask.id, id));
		return { message: 'Task updated.' };
	},

	toggleTask: async ({ request }) => {
		const formData = await request.formData();
		const id = getNumber(formData, 'id');
		const done = getBoolean(formData, 'done');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });

		await db.update(dailyTask).set({ done }).where(eq(dailyTask.id, id));
		return { message: 'Task updated.' };
	},

	deleteTask: async ({ request }) => {
		const formData = await request.formData();
		const id = getNumber(formData, 'id');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });

		await db.delete(dailyTask).where(eq(dailyTask.id, id));
		return { message: 'Task removed.' };
	},

	carryUnfinished: async ({ request }) => {
		const formData = await request.formData();
		const fromDay = getString(formData, 'fromDay') || getTodayDateString();
		const toDay = getString(formData, 'toDay') || getTomorrowDateString(fromDay);

		const unfinished = await db.query.dailyTask.findMany({
			where: and(eq(dailyTask.day, fromDay), eq(dailyTask.done, false))
		});

		let movedCount = 0;
		for (const task of unfinished) {
			const existingForTargetDay = await db.query.dailyTask.findFirst({
				where: and(eq(dailyTask.day, toDay), eq(dailyTask.title, task.title))
			});
			if (existingForTargetDay) continue;

			await db.insert(dailyTask).values({
				day: toDay,
				title: task.title,
				done: false,
				carriedOver: true
			});
			movedCount += 1;
		}

		return { message: movedCount ? `Moved ${movedCount} task(s) to ${toDay}.` : 'No tasks were moved.' };
	},

	saveNote: async ({ request }) => {
		const formData = await request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const content = getString(formData, 'content');

		await db
			.insert(dailyNote)
			.values({ day, content })
			.onConflictDoUpdate({ target: dailyNote.day, set: { content } });

		return { message: 'Note saved.' };
	},

	saveSession: async ({ request }) => {
		const formData = await request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const taskIdRaw = getString(formData, 'taskId');
		const taskId = taskIdRaw ? Number(taskIdRaw) : null;
		const durationMinutes = getNumber(formData, 'durationMinutes');
		const startedAtRaw = getString(formData, 'startedAt');
		const endedAtRaw = getString(formData, 'endedAt');
		const status = getString(formData, 'status') || 'completed';

		if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
			return fail(400, { message: 'Duration must be a positive number.' });
		}

		const startedAt = startedAtRaw ? new Date(startedAtRaw) : new Date();
		const endedAt = endedAtRaw ? new Date(endedAtRaw) : new Date();
		if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
			return fail(400, { message: 'Invalid session time values.' });
		}

		await db.insert(pomodoroSession).values({
			day,
			taskId: Number.isInteger(taskId) ? taskId : null,
			durationMinutes,
			startedAt,
			endedAt,
			status
		});

		return { message: 'Pomodoro session saved.' };
	},

	saveNotionConfig: async ({ request }) => {
		const formData = await request.formData();
		const existing = await getOrCreateConfig();

		const notionApiKeyInput = getString(formData, 'notionApiKey');
		const tasksDbId = getString(formData, 'tasksDbId');
		const notesDbId = getString(formData, 'notesDbId');

		const taskFieldMap = normalizeTaskFieldMap({
			title: getString(formData, 'taskTitleProperty'),
			done: getString(formData, 'taskDoneProperty'),
			day: getString(formData, 'taskDayProperty'),
			carriedOver: getString(formData, 'taskCarriedOverProperty')
		});

		const noteFieldMap = normalizeNoteFieldMap({
			title: getString(formData, 'noteTitleProperty'),
			content: getString(formData, 'noteContentProperty'),
			day: getString(formData, 'noteDayProperty')
		});

		await db
			.update(appConfig)
			.set({
				notionApiKey: notionApiKeyInput || existing.notionApiKey || null,
				tasksDbId: tasksDbId || null,
				notesDbId: notesDbId || null,
				taskFieldMapJson: taskFieldMap,
				noteFieldMapJson: noteFieldMap
			})
			.where(eq(appConfig.id, APP_CONFIG_ID));

		return { message: 'Notion settings saved.' };
	},

	syncNotion: async () => {
		const today = getTodayDateString();
		const config = await getOrCreateConfig();
		const apiKey = config.notionApiKey || env.NOTION_API_KEY;
		const tasksDbId = config.tasksDbId || env.NOTION_TASKS_DB_ID;
		const notesDbId = config.notesDbId || env.NOTION_NOTES_DB_ID;

		if (!apiKey || !tasksDbId || !notesDbId) {
			return fail(400, {
				message:
					'Notion config is incomplete. Set your API key and both database IDs in Notion Settings first.'
			});
		}

		const taskMap = normalizeTaskFieldMap(config.taskFieldMapJson);
		const noteMap = normalizeNoteFieldMap(config.noteFieldMapJson);

		const tasks = await db.query.dailyTask.findMany({ where: eq(dailyTask.day, today) });
		const note = await db.query.dailyNote.findFirst({ where: eq(dailyNote.day, today) });

		try {
			for (const task of tasks) {
				const notionPageId = await syncDailyTaskToNotion({
					apiKey,
					databaseId: tasksDbId,
					fieldMap: taskMap,
					task
				});
				await db.update(dailyTask).set({ notionPageId }).where(eq(dailyTask.id, task.id));
			}

			if (note) {
				const notionPageId = await syncDailyNoteToNotion({
					apiKey,
					databaseId: notesDbId,
					fieldMap: noteMap,
					note
				});
				await db.update(dailyNote).set({ notionPageId }).where(eq(dailyNote.id, note.id));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown Notion sync error';
			return fail(500, { message });
		}

		return { message: 'Notion sync completed.' };
	}
};
