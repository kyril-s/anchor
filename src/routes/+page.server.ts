import { fail, redirect } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { auth } from '$lib/server/auth';
import { appConfig, dailyNote, dailyTask, daySession, pomodoroSession } from '$lib/server/db/schema';
import { claimLegacyDataForUser } from '$lib/server/legacy-data';
import {
	normalizeNoteFieldMap,
	normalizeTaskFieldMap,
	syncDailyNoteToNotion,
	syncDailyTaskToNotion
} from '$lib/server/notion';
import type { Actions, PageServerLoad } from './$types';

const DEFAULT_THEME_HUE = 330.216;
const DEFAULT_UI_SETTINGS = {
	themeHue: DEFAULT_THEME_HUE,
	workMinutes: 25,
	breakMinutes: 5,
	longBreakMinutes: 25,
	longBreakInterval: 4
};
const MAX_CUSTOM_TIMERS = 100;

type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
type PersistedCustomTimer = {
	id: string;
	name: string;
	totalSeconds: number;
	remainingSeconds: number;
	status: TimerStatus;
	warningAtSeconds: number | null;
	criticalAtSeconds: number | null;
	warningTriggered: boolean;
	criticalTriggered: boolean;
};
type PersistedCustomTimersState = {
	timers: PersistedCustomTimer[];
	activeTimerId: string | null;
	timerNotice: string;
};

const DEFAULT_CUSTOM_TIMERS_STATE: PersistedCustomTimersState = {
	timers: [],
	activeTimerId: null,
	timerNotice: ''
};

function getTodayDateString() {
	return new Date().toISOString().slice(0, 10);
}

function getTomorrowDateString(dateString: string) {
	const date = new Date(`${dateString}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function getYesterdayDateString(dateString: string) {
	const date = new Date(`${dateString}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() - 1);
	return date.toISOString().slice(0, 10);
}

function getString(formData: FormData, key: string) {
	const value = formData.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

function toUuidFromCompactHex(value: string) {
	const compact = value.replace(/-/g, '').toLowerCase();
	if (!/^[0-9a-f]{32}$/.test(compact)) return null;
	return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function normalizeNotionDatabaseId(value: string | null | undefined) {
	const raw = value?.trim();
	if (!raw) return '';

	let decoded = raw;
	try {
		decoded = decodeURIComponent(raw);
	} catch {
		// Keep original value when URI decoding fails.
	}

	const uuidMatch = decoded.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/);
	if (!uuidMatch) return raw;

	return toUuidFromCompactHex(uuidMatch[0]) ?? raw;
}

function getNumber(formData: FormData, key: string) {
	const value = Number(getString(formData, key));
	return Number.isFinite(value) ? value : NaN;
}

function getBoolean(formData: FormData, key: string) {
	return getString(formData, key) === 'true';
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function normalizeUiSettings(raw: unknown) {
	const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const toNumber = (key: keyof typeof DEFAULT_UI_SETTINGS, fallback: number) => {
		const value = Number(source[key]);
		return Number.isFinite(value) ? value : fallback;
	};

	return {
		themeHue: clamp(toNumber('themeHue', DEFAULT_UI_SETTINGS.themeHue), 0, 360),
		workMinutes: clamp(toNumber('workMinutes', DEFAULT_UI_SETTINGS.workMinutes), 1, 120),
		breakMinutes: clamp(toNumber('breakMinutes', DEFAULT_UI_SETTINGS.breakMinutes), 1, 60),
		longBreakMinutes: clamp(toNumber('longBreakMinutes', DEFAULT_UI_SETTINGS.longBreakMinutes), 1, 120),
		longBreakInterval: clamp(
			Math.floor(toNumber('longBreakInterval', DEFAULT_UI_SETTINGS.longBreakInterval)),
			1,
			20
		)
	};
}

function normalizeCustomTimer(raw: unknown): PersistedCustomTimer | null {
	if (!raw || typeof raw !== 'object') return null;
	const source = raw as Record<string, unknown>;
	const id = typeof source.id === 'string' ? source.id.trim().slice(0, 120) : '';
	if (!id) return null;

	const name = typeof source.name === 'string' ? source.name.trim().slice(0, 60) : '';
	const totalSeconds = clamp(Math.floor(Number(source.totalSeconds) || 0), 1, 216000);
	const remainingSeconds = clamp(Math.floor(Number(source.remainingSeconds) || 0), 0, totalSeconds);
	const warningRaw =
		source.warningAtSeconds === null ? null : Math.floor(Number(source.warningAtSeconds) || 0);
	const criticalRaw =
		source.criticalAtSeconds === null ? null : Math.floor(Number(source.criticalAtSeconds) || 0);
	const warningAtSeconds =
		warningRaw === null ? null : clamp(warningRaw, 0, Math.max(0, totalSeconds - 1));
	const criticalAtSeconds =
		criticalRaw === null ? null : clamp(criticalRaw, 0, Math.max(0, totalSeconds - 1));
	const allowedStatuses: TimerStatus[] = ['idle', 'running', 'paused', 'completed'];
	const parsedStatus = typeof source.status === 'string' ? source.status : 'idle';
	const status: TimerStatus = allowedStatuses.includes(parsedStatus as TimerStatus)
		? (parsedStatus as TimerStatus)
		: 'idle';

	return {
		id,
		name: name || 'Timer',
		totalSeconds,
		remainingSeconds,
		// Running timers cannot safely continue in background while signed out; restore as paused.
		status: status === 'running' ? 'paused' : status,
		warningAtSeconds,
		criticalAtSeconds,
		warningTriggered: Boolean(source.warningTriggered),
		criticalTriggered: Boolean(source.criticalTriggered)
	};
}

function normalizeCustomTimersState(raw: unknown): PersistedCustomTimersState {
	if (!raw || typeof raw !== 'object') return DEFAULT_CUSTOM_TIMERS_STATE;
	const source = raw as Record<string, unknown>;
	const rawTimers = Array.isArray(source.timers) ? source.timers : [];
	const timers = rawTimers
		.slice(0, MAX_CUSTOM_TIMERS)
		.map((item) => normalizeCustomTimer(item))
		.filter((item): item is PersistedCustomTimer => Boolean(item));
	const activeTimerId =
		typeof source.activeTimerId === 'string' && timers.some((timer) => timer.id === source.activeTimerId)
			? source.activeTimerId
			: null;
	const timerNotice = typeof source.timerNotice === 'string' ? source.timerNotice.slice(0, 240) : '';

	return {
		timers,
		activeTimerId,
		timerNotice
	};
}

async function requireUserId(event: RequestEvent) {
	const userId = event.locals.user?.id;
	if (!userId) {
		throw redirect(302, '/login');
	}

	await claimLegacyDataForUser(userId);
	return userId;
}

async function getOrCreateConfig(userId: string) {
	const existing = await db.query.appConfig.findFirst({ where: eq(appConfig.userId, userId) });
	if (existing) return existing;

	await db.insert(appConfig).values({ userId });
	const created = await db.query.appConfig.findFirst({ where: eq(appConfig.userId, userId) });
	if (!created) throw new Error('Failed to initialize app configuration');
	return created;
}

async function moveUnfinishedTasks(userId: string, fromDay: string, toDay: string) {
	const unfinished = await db.query.dailyTask.findMany({
		where: and(eq(dailyTask.userId, userId), eq(dailyTask.day, fromDay), eq(dailyTask.done, false))
	});
	if (unfinished.length === 0) return 0;

	const unfinishedTitles = [...new Set(unfinished.map((task) => task.title))];
	const existingForTargetDay = await db.query.dailyTask.findMany({
		where: and(
			eq(dailyTask.userId, userId),
			eq(dailyTask.day, toDay),
			inArray(dailyTask.title, unfinishedTitles)
		),
		columns: { title: true }
	});
	const existingTitles = new Set(existingForTargetDay.map((task) => task.title));
	const tasksToInsert = unfinished
		.filter((task) => !existingTitles.has(task.title))
		.map((task) => ({
			userId,
			day: toDay,
			title: task.title,
			done: false,
			carriedOver: true
		}));

	if (tasksToInsert.length === 0) return 0;
	await db.insert(dailyTask).values(tasksToInsert);

	return tasksToInsert.length;
}

export const load: PageServerLoad = async (event) => {
	const userId = await requireUserId(event);
	const today = getTodayDateString();
	const [tasks, note, sessions, config, todayDaySession] = await Promise.all([
		db.query.dailyTask.findMany({
			where: and(eq(dailyTask.userId, userId), eq(dailyTask.day, today)),
			orderBy: [asc(dailyTask.id)]
		}),
		db.query.dailyNote.findFirst({ where: and(eq(dailyNote.userId, userId), eq(dailyNote.day, today)) }),
		db.query.pomodoroSession.findMany({
			where: and(eq(pomodoroSession.userId, userId), eq(pomodoroSession.day, today)),
			orderBy: [desc(pomodoroSession.startedAt)],
			limit: 20
		}),
		getOrCreateConfig(userId),
		db.query.daySession.findFirst({ where: and(eq(daySession.userId, userId), eq(daySession.day, today)) })
	]);

	const normalizedTaskMap = normalizeTaskFieldMap(config.taskFieldMapJson);
	const normalizedNoteMap = normalizeNoteFieldMap(config.noteFieldMapJson);

	return {
		today,
		user: event.locals.user,
		dayStarted: Boolean(todayDaySession),
		dayStartedAt: todayDaySession?.startedAt ?? null,
		tasks,
		note: note?.content ?? '',
		sessions,
		uiSettings: normalizeUiSettings(config.uiSettingsJson),
		customTimersState: normalizeCustomTimersState(
			config.uiSettingsJson &&
				typeof config.uiSettingsJson === 'object' &&
				'customTimersState' in config.uiSettingsJson
				? (config.uiSettingsJson as Record<string, unknown>).customTimersState
				: null
		),
		notionConfig: {
			hasApiKey: Boolean(config.notionApiKey || env.NOTION_API_KEY),
			tasksDbId: normalizeNotionDatabaseId(config.tasksDbId || env.NOTION_TASKS_DB_ID) || '',
			notesDbId: normalizeNotionDatabaseId(config.notesDbId || env.NOTION_NOTES_DB_ID) || '',
			taskFieldMap: normalizedTaskMap,
			noteFieldMap: normalizedNoteMap
		}
	};
};

export const actions: Actions = {
	addTask: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const title = getString(formData, 'title');
		const day = getString(formData, 'day') || getTodayDateString();

		if (!title) return fail(400, { message: 'Task title is required.' });

		await db.insert(dailyTask).values({ userId, title, day });
		return { message: 'Task added.' };
	},

	updateTask: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const id = getNumber(formData, 'id');
		const title = getString(formData, 'title');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });
		if (!title) return fail(400, { message: 'Task title is required.' });

		await db
			.update(dailyTask)
			.set({ title })
			.where(and(eq(dailyTask.id, id), eq(dailyTask.userId, userId)));
		return { message: 'Task updated.' };
	},

	toggleTask: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const id = getNumber(formData, 'id');
		const done = getBoolean(formData, 'done');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });

		await db
			.update(dailyTask)
			.set({ done })
			.where(and(eq(dailyTask.id, id), eq(dailyTask.userId, userId)));
		return { message: 'Task updated.' };
	},

	deleteTask: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const id = getNumber(formData, 'id');

		if (!Number.isInteger(id)) return fail(400, { message: 'Invalid task id.' });

		await db.delete(dailyTask).where(and(eq(dailyTask.id, id), eq(dailyTask.userId, userId)));
		return { message: 'Task removed.' };
	},

	carryUnfinished: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const fromDay = getString(formData, 'fromDay') || getTodayDateString();
		const toDay = getString(formData, 'toDay') || getTomorrowDateString(fromDay);
		const movedCount = await moveUnfinishedTasks(userId, fromDay, toDay);

		return { message: movedCount ? `Moved ${movedCount} task(s) to ${toDay}.` : 'No tasks were moved.' };
	},

	startDay: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const moveUnfinished = getBoolean(formData, 'moveUnfinished');
		const config = await getOrCreateConfig(userId);

		const existingDaySession = await db.query.daySession.findFirst({
			where: and(eq(daySession.userId, userId), eq(daySession.day, day))
		});
		if (existingDaySession) {
			return { message: 'Day already started.' };
		}

		await db.insert(daySession).values({ userId, day, startedAt: new Date() });

		const customTimersState = normalizeCustomTimersState(
			config.uiSettingsJson &&
				typeof config.uiSettingsJson === 'object' &&
				'customTimersState' in config.uiSettingsJson
				? (config.uiSettingsJson as Record<string, unknown>).customTimersState
				: null
		);

		await db
			.insert(dailyNote)
			.values({ userId, day, content: '' })
			.onConflictDoUpdate({
				target: [dailyNote.userId, dailyNote.day],
				set: { content: '' }
			});

		await db
			.update(appConfig)
			.set({ uiSettingsJson: { ...DEFAULT_UI_SETTINGS, customTimersState } })
			.where(eq(appConfig.userId, userId));

		if (!moveUnfinished) {
			return { message: 'Day started. Dump cleared and Pomodoro settings reset to defaults.' };
		}

		const previousDay = getYesterdayDateString(day);
		const movedCount = await moveUnfinishedTasks(userId, previousDay, day);
		return {
			message: movedCount
				? `Day started. Reset complete and moved ${movedCount} task(s) from ${previousDay}.`
				: 'Day started. Reset complete. No tasks were moved.'
		};
	},

	finishDay: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const existingDaySession = await db.query.daySession.findFirst({
			where: and(eq(daySession.userId, userId), eq(daySession.day, day))
		});

		if (!existingDaySession) {
			return { message: 'Day is not started yet.' };
		}

		await db.delete(daySession).where(and(eq(daySession.userId, userId), eq(daySession.day, day)));
		return { message: 'Day finished.' };
	},

	saveNote: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const content = getString(formData, 'content');

		await db
			.insert(dailyNote)
			.values({ userId, day, content })
			.onConflictDoUpdate({
				target: [dailyNote.userId, dailyNote.day],
				set: { content }
			});

		return { message: 'Note saved.' };
	},

	saveSession: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const day = getString(formData, 'day') || getTodayDateString();
		const taskIdRaw = getString(formData, 'taskId');
		const parsedTaskId = taskIdRaw ? Number(taskIdRaw) : null;
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

		let taskId: number | null = null;
		if (parsedTaskId !== null && Number.isInteger(parsedTaskId)) {
			const task = await db.query.dailyTask.findFirst({
				where: and(eq(dailyTask.id, parsedTaskId), eq(dailyTask.userId, userId))
			});

			if (!task) {
				return fail(400, { message: 'Invalid task selected for session.' });
			}
			taskId = task.id;
		}

		await db.insert(pomodoroSession).values({
			userId,
			day,
			taskId,
			durationMinutes,
			startedAt,
			endedAt,
			status
		});

		return { message: 'Pomodoro session saved.' };
	},

	saveUiSettings: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const config = await getOrCreateConfig(userId);
		const settings = normalizeUiSettings({
			themeHue: getNumber(formData, 'themeHue'),
			workMinutes: getNumber(formData, 'workMinutes'),
			breakMinutes: getNumber(formData, 'breakMinutes'),
			longBreakMinutes: getNumber(formData, 'longBreakMinutes'),
			longBreakInterval: getNumber(formData, 'longBreakInterval')
		});
		const customTimersState = normalizeCustomTimersState(
			config.uiSettingsJson &&
				typeof config.uiSettingsJson === 'object' &&
				'customTimersState' in config.uiSettingsJson
				? (config.uiSettingsJson as Record<string, unknown>).customTimersState
				: null
		);

		await db
			.update(appConfig)
			.set({
				uiSettingsJson: { ...settings, customTimersState }
			})
			.where(eq(appConfig.userId, userId));

		return { message: 'Pomodoro settings saved.' };
	},

	saveCustomTimers: async (event) => {
		const userId = await requireUserId(event);
		const config = await getOrCreateConfig(userId);
		const formData = await event.request.formData();
		const rawState = getString(formData, 'state');
		if (!rawState) return fail(400, { message: 'Missing timers state payload.' });

		let parsedState: unknown = null;
		try {
			parsedState = JSON.parse(rawState);
		} catch {
			return fail(400, { message: 'Invalid timers state payload.' });
		}

		const customTimersState = normalizeCustomTimersState(parsedState);
		const settings = normalizeUiSettings(config.uiSettingsJson);

		await db
			.update(appConfig)
			.set({
				uiSettingsJson: { ...settings, customTimersState }
			})
			.where(eq(appConfig.userId, userId));

		return { message: 'Timers state saved.' };
	},

	saveNotionConfig: async (event) => {
		const userId = await requireUserId(event);
		const formData = await event.request.formData();
		const existing = await getOrCreateConfig(userId);

		const notionApiKeyInput = getString(formData, 'notionApiKey');
		const tasksDbId = normalizeNotionDatabaseId(getString(formData, 'tasksDbId'));
		const notesDbId = normalizeNotionDatabaseId(getString(formData, 'notesDbId'));

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
			.where(eq(appConfig.userId, userId));

		return { message: 'Notion settings saved.' };
	},

	syncNotion: async (event) => {
		const userId = await requireUserId(event);
		const today = getTodayDateString();
		const config = await getOrCreateConfig(userId);
		const apiKey = config.notionApiKey || env.NOTION_API_KEY;
		const tasksDbId = normalizeNotionDatabaseId(config.tasksDbId || env.NOTION_TASKS_DB_ID);
		const notesDbId = normalizeNotionDatabaseId(config.notesDbId || env.NOTION_NOTES_DB_ID);

		if (!apiKey || !tasksDbId || !notesDbId) {
			return fail(400, {
				message:
					'Notion config is incomplete. Set your API key and both database IDs in Notion Settings first.'
			});
		}

		const taskMap = normalizeTaskFieldMap(config.taskFieldMapJson);
		const noteMap = normalizeNoteFieldMap(config.noteFieldMapJson);

		const tasks = await db.query.dailyTask.findMany({
			where: and(eq(dailyTask.userId, userId), eq(dailyTask.day, today))
		});
		const note = await db.query.dailyNote.findFirst({
			where: and(eq(dailyNote.userId, userId), eq(dailyNote.day, today))
		});

		try {
			for (const task of tasks) {
				const notionPageId = await syncDailyTaskToNotion({
					apiKey,
					databaseId: tasksDbId,
					fieldMap: taskMap,
					task
				});
				await db
					.update(dailyTask)
					.set({ notionPageId })
					.where(and(eq(dailyTask.id, task.id), eq(dailyTask.userId, userId)));
			}

			if (note) {
				const notionPageId = await syncDailyNoteToNotion({
					apiKey,
					databaseId: notesDbId,
					fieldMap: noteMap,
					note
				});
				await db
					.update(dailyNote)
					.set({ notionPageId })
					.where(and(eq(dailyNote.id, note.id), eq(dailyNote.userId, userId)));
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown Notion sync error';
			return fail(500, { message });
		}

		return { message: 'Notion sync completed.' };
	},

	signOut: async (event) => {
		await auth.api.signOut({
			headers: event.request.headers
		});
		return redirect(302, '/login');
	}
};
