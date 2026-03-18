<script lang="ts">
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const initialDuration = 25;
	let durationMinutes = initialDuration;
	let remainingSeconds = initialDuration * 60;
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let timerStatus: 'idle' | 'running' | 'paused' | 'completed' = 'idle';
	let selectedTaskId = data.tasks[0]?.id?.toString() ?? '';
	let sessionStartedAt = '';
	let sessionEndedAt = '';
	let sessionStatus = 'completed';

	function formatClock(totalSeconds: number) {
		const mins = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const secs = Math.floor(totalSeconds % 60)
			.toString()
			.padStart(2, '0');
		return `${mins}:${secs}`;
	}

	function startTimer() {
		if (timerStatus === 'running') return;
		if (!sessionStartedAt) sessionStartedAt = new Date().toISOString();
		timerStatus = 'running';
		sessionStatus = 'in_progress';

		if (timerHandle) clearInterval(timerHandle);
		timerHandle = setInterval(() => {
			if (remainingSeconds <= 1) {
				remainingSeconds = 0;
				sessionEndedAt = new Date().toISOString();
				sessionStatus = 'completed';
				timerStatus = 'completed';
				if (timerHandle) clearInterval(timerHandle);
				timerHandle = null;
				return;
			}
			remainingSeconds -= 1;
		}, 1000);
	}

	function pauseTimer() {
		if (timerStatus !== 'running') return;
		timerStatus = 'paused';
		if (timerHandle) clearInterval(timerHandle);
		timerHandle = null;
	}

	function resetTimer() {
		if (timerHandle) clearInterval(timerHandle);
		timerHandle = null;
		timerStatus = 'idle';
		remainingSeconds = durationMinutes * 60;
		sessionStartedAt = '';
		sessionEndedAt = '';
		sessionStatus = 'completed';
	}

	$effect(() => {
		if (timerStatus === 'idle') {
			remainingSeconds = durationMinutes * 60;
		}
	});

	$effect(() => {
		if (timerStatus === 'completed' && !sessionEndedAt) {
			sessionEndedAt = new Date().toISOString();
		}
	});
</script>

<main>
	<h1>Anchor</h1>
	<p>{data.today}</p>

	{#if form?.message}
		<p class="message">{form.message}</p>
	{/if}

	<section>
		<h2>Today&apos;s Tasks</h2>
		<form method="post" action="?/addTask">
			<input type="hidden" name="day" value={data.today} />
			<input name="title" type="text" placeholder="Add a task..." required />
			<button type="submit">Add</button>
		</form>

		<form method="post" action="?/carryUnfinished">
			<input type="hidden" name="fromDay" value={data.today} />
			<button type="submit">Move unfinished to tomorrow</button>
		</form>

		<ul>
			{#if data.tasks.length === 0}
				<li>No tasks yet.</li>
			{/if}
			{#each data.tasks as task}
				<li>
					<form method="post" action="?/toggleTask">
						<input type="hidden" name="id" value={task.id} />
						<input type="hidden" name="done" value={task.done ? 'false' : 'true'} />
						<button type="submit">{task.done ? 'Mark open' : 'Mark done'}</button>
					</form>

					<form method="post" action="?/updateTask">
						<input type="hidden" name="id" value={task.id} />
						<input name="title" value={task.title} required />
						<button type="submit">Save</button>
					</form>

					<form method="post" action="?/deleteTask">
						<input type="hidden" name="id" value={task.id} />
						<button type="submit">Delete</button>
					</form>
				</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Pomodoro</h2>
		<label>
			Duration (minutes)
			<input type="number" min="1" bind:value={durationMinutes} />
		</label>
		<label>
			Linked task
			<select bind:value={selectedTaskId}>
				<option value="">No task</option>
				{#each data.tasks as task}
					<option value={task.id}>{task.title}</option>
				{/each}
			</select>
		</label>

		<p class="clock">{formatClock(remainingSeconds)}</p>
		<div class="row">
			<button type="button" on:click={startTimer}>Start</button>
			<button type="button" on:click={pauseTimer}>Pause</button>
			<button type="button" on:click={resetTimer}>Reset</button>
		</div>

		<form method="post" action="?/saveSession">
			<input type="hidden" name="day" value={data.today} />
			<input type="hidden" name="taskId" value={selectedTaskId} />
			<input type="hidden" name="durationMinutes" value={durationMinutes} />
			<input type="hidden" name="startedAt" value={sessionStartedAt} />
			<input type="hidden" name="endedAt" value={sessionEndedAt} />
			<input type="hidden" name="status" value={sessionStatus} />
			<button type="submit" disabled={timerStatus !== 'completed'}>Save completed session</button>
		</form>

		<ul>
			{#if data.sessions.length === 0}
				<li>No sessions saved yet.</li>
			{/if}
			{#each data.sessions as session}
				<li>{session.durationMinutes} min - {session.status}</li>
			{/each}
		</ul>
	</section>

	<section>
		<h2>Quick Notes</h2>
		<form method="post" action="?/saveNote">
			<input type="hidden" name="day" value={data.today} />
			<textarea name="content" rows="6" placeholder="Drop your notes here...">{data.note}</textarea>
			<button type="submit">Save note</button>
		</form>
	</section>

	<section>
		<h2>Notion Settings</h2>
		<form method="post" action="?/saveNotionConfig">
			<label>
				Notion secret key
				<input
					type="password"
					name="notionApiKey"
					placeholder={data.notionConfig.hasApiKey ? 'Saved (leave blank to keep)' : 'secret_xxx'}
				/>
			</label>
			<label>
				Tasks DB ID
				<input type="text" name="tasksDbId" value={data.notionConfig.tasksDbId} />
			</label>
			<label>
				Notes DB ID
				<input type="text" name="notesDbId" value={data.notionConfig.notesDbId} />
			</label>

			<h3>Task mapping</h3>
			<label>
				Title property
				<input type="text" name="taskTitleProperty" value={data.notionConfig.taskFieldMap.title} />
			</label>
			<label>
				Done property
				<input type="text" name="taskDoneProperty" value={data.notionConfig.taskFieldMap.done} />
			</label>
			<label>
				Day property
				<input type="text" name="taskDayProperty" value={data.notionConfig.taskFieldMap.day} />
			</label>
			<label>
				Carried over property
				<input type="text" name="taskCarriedOverProperty" value={data.notionConfig.taskFieldMap.carriedOver} />
			</label>

			<h3>Note mapping</h3>
			<label>
				Title property
				<input type="text" name="noteTitleProperty" value={data.notionConfig.noteFieldMap.title} />
			</label>
			<label>
				Content property
				<input type="text" name="noteContentProperty" value={data.notionConfig.noteFieldMap.content} />
			</label>
			<label>
				Day property
				<input type="text" name="noteDayProperty" value={data.notionConfig.noteFieldMap.day} />
			</label>
			<button type="submit">Save Notion settings</button>
		</form>

		<form method="post" action="?/syncNotion">
			<button type="submit">Sync now</button>
		</form>
	</section>
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 1.25rem;
		display: grid;
		gap: 1rem;
	}

	section {
		border: 1px solid #d4d4d8;
		border-radius: 8px;
		padding: 1rem;
		display: grid;
		gap: 0.75rem;
	}

	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	textarea,
	input,
	select,
	button {
		font: inherit;
	}

	input,
	select,
	textarea {
		border: 1px solid #a1a1aa;
		border-radius: 6px;
		padding: 0.45rem 0.5rem;
	}

	button {
		border: 1px solid #52525b;
		border-radius: 6px;
		padding: 0.45rem 0.7rem;
		background: #fafafa;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.5rem;
	}

	li {
		display: grid;
		gap: 0.5rem;
		border: 1px dashed #d4d4d8;
		padding: 0.6rem;
		border-radius: 6px;
	}

	label {
		display: grid;
		gap: 0.25rem;
		width: 100%;
	}

	.clock {
		font-size: 2rem;
		font-weight: 700;
		margin: 0;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.message {
		background: #f0f9ff;
		border: 1px solid #bae6fd;
		padding: 0.6rem;
		border-radius: 6px;
	}
</style>
