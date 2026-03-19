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

type NotionDatabaseResponse = {
	properties: Record<
		string,
		{
			type: string;
		}
	>;
};

type NotionDatabaseSchema = {
	propertyTypes: Record<string, string>;
	titlePropertyName: string | null;
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

function notionDate(value: string) {
	const day = value?.trim();
	if (!day) return { date: null };
	return { date: { start: day } };
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

const DB_SCHEMA_CACHE_TTL_MS = 60_000;
const dbSchemaCache = new Map<string, { expiresAt: number; schema: NotionDatabaseSchema }>();

function toTextValue(value: string | boolean) {
	return typeof value === 'string' ? value : value ? 'true' : 'false';
}

function toDateValue(value: string | boolean) {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

function buildPropertyValueByType(type: string | undefined, value: string | boolean, fallback: 'title' | 'text' | 'checkbox' | 'date') {
	switch (type) {
		case 'title':
			return notionTitle(toTextValue(value));
		case 'rich_text':
			return notionText(toTextValue(value));
		case 'checkbox':
			return notionCheckbox(Boolean(value));
		case 'date':
			return notionDate(toDateValue(value));
		default:
			switch (fallback) {
				case 'title':
					return notionTitle(toTextValue(value));
				case 'checkbox':
					return notionCheckbox(Boolean(value));
				case 'date':
					return notionDate(toDateValue(value));
				case 'text':
				default:
					return notionText(toTextValue(value));
			}
	}
}

function buildPropertyTypesMap(database: NotionDatabaseResponse): NotionDatabaseSchema {
	const propertyTypes: Record<string, string> = {};
	let titlePropertyName: string | null = null;

	for (const [name, property] of Object.entries(database.properties ?? {})) {
		propertyTypes[name] = property.type;
		if (!titlePropertyName && property.type === 'title') titlePropertyName = name;
	}

	return { propertyTypes, titlePropertyName };
}

async function notionRequest<T>(
	apiKey: string,
	path: string,
	method: string,
	body?: unknown
): Promise<T> {
	const requestInit: RequestInit = {
		method,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Notion-Version': '2022-06-28',
			'Content-Type': 'application/json'
		}
	};
	if (body !== undefined) {
		requestInit.body = JSON.stringify(body);
	}

	const response = await fetch(`https://api.notion.com/v1/${path}`, {
		...requestInit
	});

	if (!response.ok) {
		const details = await response.text();
		throw new Error(`Notion API error (${response.status}): ${details}`);
	}

	return (await response.json()) as T;
}

async function getDatabaseSchema(apiKey: string, databaseId: string): Promise<NotionDatabaseSchema> {
	const cacheKey = `${apiKey}:${databaseId}`;
	const cached = dbSchemaCache.get(cacheKey);
	const now = Date.now();
	if (cached && cached.expiresAt > now) return cached.schema;

	const database = await notionRequest<NotionDatabaseResponse>(
		apiKey,
		`databases/${databaseId}`,
		'GET'
	);
	const schema = buildPropertyTypesMap(database);
	dbSchemaCache.set(cacheKey, { schema, expiresAt: now + DB_SCHEMA_CACHE_TTL_MS });
	return schema;
}

function addMappedProperty(
	properties: Record<string, unknown>,
	propertyName: string | undefined,
	value: string | boolean,
	fallback: 'title' | 'text' | 'checkbox' | 'date',
	schema: NotionDatabaseSchema
) {
	const key = propertyName?.trim();
	if (!key) return;
	const mappedType = schema.propertyTypes[key];
	properties[key] = buildPropertyValueByType(mappedType, value, fallback);
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
	const schema = await getDatabaseSchema(input.apiKey, input.databaseId);
	const properties: Record<string, unknown> = {};
	addMappedProperty(properties, input.fieldMap.title, input.task.title, 'title', schema);
	addMappedProperty(properties, input.fieldMap.done, input.task.done, 'checkbox', schema);
	addMappedProperty(properties, input.fieldMap.day, input.task.day, 'date', schema);
	addMappedProperty(properties, input.fieldMap.carriedOver, input.task.carriedOver, 'checkbox', schema);
	if (schema.titlePropertyName && !(schema.titlePropertyName in properties)) {
		addProperty(properties, schema.titlePropertyName, notionTitle(input.task.title));
	}

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
	const schema = await getDatabaseSchema(input.apiKey, input.databaseId);
	const properties: Record<string, unknown> = {};
	const titleValue = input.note.day;
	addMappedProperty(properties, input.fieldMap.title, titleValue, 'title', schema);
	addMappedProperty(properties, input.fieldMap.day, input.note.day, 'date', schema);
	addMappedProperty(properties, input.fieldMap.content, input.note.content, 'text', schema);
	if (schema.titlePropertyName && !(schema.titlePropertyName in properties)) {
		addProperty(properties, schema.titlePropertyName, notionTitle(titleValue));
	}

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
