export type TaskFieldMap = {
	title: string;
	done: string;
	day: string;
	carriedOver: string;
};

export type NoteFieldMap = {
	title: string;
	content: string;
	day: string;
};

export const DEFAULT_TASK_FIELD_MAP: TaskFieldMap = {
	title: 'Name',
	done: 'Done',
	day: 'Day',
	carriedOver: 'Carried Over'
};

export const DEFAULT_NOTE_FIELD_MAP: NoteFieldMap = {
	title: 'Name',
	content: 'Content',
	day: 'Day'
};

type NotionPageResponse = {
	id: string;
};

type SyncTaskInput = {
	apiKey: string;
	databaseId: string;
	fieldMap: TaskFieldMap;
	task: {
		id: number;
		day: string;
		title: string;
		done: boolean;
		carriedOver: boolean;
		notionPageId: string | null;
	};
};

type SyncNoteInput = {
	apiKey: string;
	databaseId: string;
	fieldMap: NoteFieldMap;
	note: {
		id: number;
		day: string;
		content: string;
		notionPageId: string | null;
	};
};

function trimTo(value: string, max = 1800): string {
	return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function notionTitle(value: string) {
	return { title: [{ text: { content: trimTo(value || 'Untitled') } }] };
}

function notionText(value: string) {
	return { rich_text: [{ text: { content: trimTo(value || '') } }] };
}

function notionCheckbox(value: boolean) {
	return { checkbox: value };
}

function addProperty(
	properties: Record<string, unknown>,
	propertyName: string | undefined,
	value: Record<string, unknown>
) {
	const key = propertyName?.trim();
	if (!key) return;
	properties[key] = value;
}

async function notionRequest<T>(apiKey: string, path: string, method: string, body: unknown): Promise<T> {
	const response = await fetch(`https://api.notion.com/v1/${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const details = await response.text();
		throw new Error(`Notion API error (${response.status}): ${details}`);
	}

	return (await response.json()) as T;
}

export function normalizeTaskFieldMap(input: Record<string, unknown> | null | undefined): TaskFieldMap {
	return {
		title: typeof input?.title === 'string' && input.title.trim() ? input.title : DEFAULT_TASK_FIELD_MAP.title,
		done: typeof input?.done === 'string' && input.done.trim() ? input.done : DEFAULT_TASK_FIELD_MAP.done,
		day: typeof input?.day === 'string' && input.day.trim() ? input.day : DEFAULT_TASK_FIELD_MAP.day,
		carriedOver:
			typeof input?.carriedOver === 'string' && input.carriedOver.trim()
				? input.carriedOver
				: DEFAULT_TASK_FIELD_MAP.carriedOver
	};
}

export function normalizeNoteFieldMap(input: Record<string, unknown> | null | undefined): NoteFieldMap {
	return {
		title: typeof input?.title === 'string' && input.title.trim() ? input.title : DEFAULT_NOTE_FIELD_MAP.title,
		content:
			typeof input?.content === 'string' && input.content.trim() ? input.content : DEFAULT_NOTE_FIELD_MAP.content,
		day: typeof input?.day === 'string' && input.day.trim() ? input.day : DEFAULT_NOTE_FIELD_MAP.day
	};
}

export async function syncDailyTaskToNotion(input: SyncTaskInput): Promise<string> {
	const properties: Record<string, unknown> = {};
	addProperty(properties, input.fieldMap.title, notionTitle(input.task.title));
	addProperty(properties, input.fieldMap.done, notionCheckbox(input.task.done));
	addProperty(properties, input.fieldMap.day, notionText(input.task.day));
	addProperty(properties, input.fieldMap.carriedOver, notionCheckbox(input.task.carriedOver));

	if (input.task.notionPageId) {
		const result = await notionRequest<NotionPageResponse>(input.apiKey, `pages/${input.task.notionPageId}`, 'PATCH', {
			properties
		});
		return result.id;
	}

	const result = await notionRequest<NotionPageResponse>(input.apiKey, 'pages', 'POST', {
		parent: { database_id: input.databaseId },
		properties
	});
	return result.id;
}

export async function syncDailyNoteToNotion(input: SyncNoteInput): Promise<string> {
	const properties: Record<string, unknown> = {};
	const titleValue = input.note.day;
	addProperty(properties, input.fieldMap.title, notionTitle(titleValue));
	addProperty(properties, input.fieldMap.day, notionText(input.note.day));
	addProperty(properties, input.fieldMap.content, notionText(input.note.content));

	if (input.note.notionPageId) {
		const result = await notionRequest<NotionPageResponse>(input.apiKey, `pages/${input.note.notionPageId}`, 'PATCH', {
			properties
		});
		return result.id;
	}

	const result = await notionRequest<NotionPageResponse>(input.apiKey, 'pages', 'POST', {
		parent: { database_id: input.databaseId },
		properties
	});
	return result.id;
}
