<script lang="ts">
	import { onDestroy } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import type { ActionData, PageData } from './$types';

	type Mode = 'work' | 'break' | 'longBreak';
	type MainTab = 'my-day' | 'timers';
	type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
	const DEFAULT_THEME_HUE = 330.216;

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uiSettings = data.uiSettings;

	let currentHue = $state(uiSettings.themeHue);
	let workMinutes = $state(uiSettings.workMinutes);
	let breakMinutes = $state(uiSettings.breakMinutes);
	let longBreakMinutes = $state(uiSettings.longBreakMinutes);
	let longBreakInterval = $state(uiSettings.longBreakInterval);
	let selectedTaskId = $state(data.tasks[0]?.id?.toString() ?? '');
	let activeTab = $state<MainTab>('my-day');
	let settingsOpen = $state(false);

	const workSeconds = $derived(workMinutes * 60);
	const breakSeconds = $derived(breakMinutes * 60);
	const longBreakSeconds = $derived(longBreakMinutes * 60);
	let completedWorkSessions = $state(0);

	let currentMode = $state<Mode>('work');
	let timeRemaining = $state(workSeconds);
	let timerStatus = $state<TimerStatus>('idle');
	let timerHandle: ReturnType<typeof setInterval> | null = null;

	let sessionStartedAt = $state('');
	let sessionEndedAt = $state('');
	let sessionStatus = $state('completed');
	let completedDurationMinutes = $state(workMinutes);

	const modeOrder: Mode[] = ['work', 'break', 'longBreak'];

	function clamp(value: number, min: number, max: number) {
		return Math.max(min, Math.min(max, value));
	}

	function hsl(h: number, s: number, l: number) {
		return `hsl(${h} ${s}% ${l}%)`;
	}

	function hsla(h: number, s: number, l: number, a: number) {
		return `hsl(${h} ${s}% ${l}% / ${a})`;
	}

	function applyColors(dark: boolean) {
		const h = currentHue;
		const root = document.documentElement.style;
		const breakH = (h + 150) % 360;
		const longH = (h + 80) % 360;

		if (dark) {
			root.setProperty('--app-clr-surface-page', hsl(h, 30, 6));
			root.setProperty('--app-clr-surface-card', hsl(h, 30, 12));
			root.setProperty('--app-clr-surface-raised', hsl(h, 28, 18));
			root.setProperty('--app-clr-on-surface-text', hsl(h, 12, 92));
			root.setProperty('--app-clr-on-surface-text-secondary', hsl(h, 12, 63));
			root.setProperty('--app-clr-on-surface-text-muted', hsl(h, 10, 43));
			root.setProperty('--app-clr-work', hsl(h, 65, 68));
			root.setProperty('--app-clr-break', hsl(breakH, 55, 68));
			root.setProperty('--app-clr-long-break', hsl(longH, 60, 68));
			root.setProperty('--app-clr-action-primary', '#f0f0f0');
			root.setProperty('--app-clr-action-primary-text', '#111111');
			root.setProperty('--app-clr-focus-ring', hsla(h, 60, 70, 0.5));
		} else {
			root.setProperty('--app-clr-surface-page', hsl(h, 8, 93));
			root.setProperty('--app-clr-surface-card', hsl(h, 8, 96));
			root.setProperty('--app-clr-surface-raised', hsl(h, 6, 91));
			root.setProperty('--app-clr-on-surface-text', hsl(h, 20, 14));
			root.setProperty('--app-clr-on-surface-text-secondary', hsl(h, 14, 43));
			root.setProperty('--app-clr-on-surface-text-muted', hsl(h, 10, 63));
			root.setProperty('--app-clr-work', hsl(h, 65, 42));
			root.setProperty('--app-clr-break', hsl(breakH, 55, 35));
			root.setProperty('--app-clr-long-break', hsl(longH, 60, 38));
			root.setProperty('--app-clr-action-primary', '#1a1a1a');
			root.setProperty('--app-clr-action-primary-text', '#ffffff');
			root.setProperty('--app-clr-focus-ring', hsla(h, 70, 60, 0.5));
		}
	}

	function applyTheme() {
		// Keep "focus mode" styling tied to active work sessions.
		const isDark = timerStatus === 'running' && currentMode === 'work';
		document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
		applyColors(isDark);
	}

	function secondsForMode(mode: Mode) {
		if (mode === 'work') return workSeconds;
		if (mode === 'longBreak') return longBreakSeconds;
		return breakSeconds;
	}

	function formatClock(totalSeconds: number) {
		const mins = Math.floor(totalSeconds / 60)
			.toString()
			.padStart(2, '0');
		const secs = Math.floor(totalSeconds % 60)
			.toString()
			.padStart(2, '0');
		return `${mins}:${secs}`;
	}

	function modeLabel(mode: Mode) {
		if (mode === 'longBreak') return 'Long Break';
		if (mode === 'break') return 'Break';
		return 'Work';
	}

	function formatModeDuration(mode: Mode) {
		return `${Math.ceil(secondsForMode(mode) / 60)}m`;
	}

	function stopInterval() {
		if (!timerHandle) return;
		clearInterval(timerHandle);
		timerHandle = null;
	}

	function clearSessionDraft() {
		sessionStartedAt = '';
		sessionEndedAt = '';
		sessionStatus = 'completed';
	}

	function beginSessionIfNeeded() {
		if (sessionStartedAt) return;
		sessionStartedAt = new Date().toISOString();
		sessionStatus = 'in_progress';
	}

	function getNextMode(mode: Mode, completedWorkCount: number) {
		if (mode === 'work') {
			return completedWorkCount % longBreakInterval === 0 ? 'longBreak' : 'break';
		}
		return 'work';
	}

	function tick() {
		if (timeRemaining <= 1) {
			const finishedMode = currentMode;
			timeRemaining = 0;
			completedDurationMinutes = Math.round(secondsForMode(finishedMode) / 60);
			sessionEndedAt = new Date().toISOString();
			sessionStatus = 'completed';
			timerStatus = 'completed';
			stopInterval();

			if (finishedMode === 'work') {
				completedWorkSessions += 1;
			}

			currentMode = getNextMode(finishedMode, completedWorkSessions);
			timeRemaining = secondsForMode(currentMode);
			return;
		}

		timeRemaining -= 1;
	}

	function startPause() {
		if (timerStatus === 'running') {
			timerStatus = 'paused';
			stopInterval();
			return;
		}

		if (timerStatus === 'completed') {
			clearSessionDraft();
		}
		beginSessionIfNeeded();
		timerStatus = 'running';
		stopInterval();
		timerHandle = setInterval(tick, 1000);
	}

	function resetTimer() {
		stopInterval();
		timerStatus = 'idle';
		currentMode = 'work';
		timeRemaining = workSeconds;
		clearSessionDraft();
		completedDurationMinutes = workMinutes;
		completedWorkSessions = 0;
	}

	function switchMode(mode: Mode) {
		if (mode === currentMode) return;
		stopInterval();
		timerStatus = 'idle';
		currentMode = mode;
		timeRemaining = secondsForMode(mode);
		clearSessionDraft();
	}

	function switchModeForward() {
		const idx = modeOrder.indexOf(currentMode);
		switchMode(modeOrder[(idx + 1) % modeOrder.length]);
	}

	function switchModeBackward() {
		const idx = modeOrder.indexOf(currentMode);
		switchMode(modeOrder[(idx - 1 + modeOrder.length) % modeOrder.length]);
	}

	function applyPomodoroSettings() {
		workMinutes = clamp(Math.floor(workMinutes || 25), 1, 120);
		breakMinutes = clamp(Math.floor(breakMinutes || 5), 1, 60);
		longBreakMinutes = clamp(Math.floor(longBreakMinutes || 25), 1, 120);
		longBreakInterval = clamp(Math.floor(longBreakInterval || 4), 1, 20);
		currentHue = clamp(Math.floor(currentHue || DEFAULT_THEME_HUE), 0, 360);

		if (timerStatus === 'idle' || timerStatus === 'paused') {
			timeRemaining = secondsForMode(currentMode);
		}
	}

	function applyShortcut(mode: Mode, minutes: number) {
		if (timerStatus === 'running') return;
		if (mode === 'work') workMinutes = minutes;
		if (mode === 'break') breakMinutes = minutes;
		if (mode === 'longBreak') longBreakMinutes = minutes;
		applyPomodoroSettings();
	}

	function buildSchedule() {
		// Build a short "what comes next" preview from current timer state.
		const items: { mode: Mode; isActive: boolean }[] = [];
		let simMode: Mode = currentMode;
		let simCompletedWork = completedWorkSessions;

		items.push({ mode: simMode, isActive: true });
		while (items.length < 8) {
			if (simMode === 'work') simCompletedWork += 1;
			simMode = getNextMode(simMode, simCompletedWork);
			items.push({ mode: simMode, isActive: false });
		}
		return items;
	}

	function onKeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		const isTypingField = !!target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
		if (isTypingField) return;

		if (event.code === 'Space') {
			event.preventDefault();
			startPause();
		}
		if (event.code === 'KeyR') resetTimer();
		if (event.code === 'BracketRight') switchModeForward();
		if (event.code === 'BracketLeft') switchModeBackward();
	}

	function openSettings() {
		settingsOpen = true;
	}

	function closeSettings() {
		settingsOpen = false;
	}

	function getToastTone(message?: string): 'success' | 'warning' | 'error' {
		if (!message) return 'success';
		const normalized = message.toLowerCase();
		if (
			normalized.includes('invalid') ||
			normalized.includes('failed') ||
			normalized.includes('incomplete') ||
			normalized.includes('error')
		) {
			return 'error';
		}
		if (normalized.includes('no ') || normalized.includes('nothing')) {
			return 'warning';
		}
		return 'success';
	}

	$effect(() => {
		applyTheme();
	});

	$effect(() => {
		applyPomodoroSettings();
	});

	$effect(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	onDestroy(() => stopInterval());
</script>

<main class="page-shell" data-mode={currentMode} data-running={timerStatus === 'running'}>
	<header class="top-nav card">
		<div class="nav-brand">
			<h1>Anchor</h1>
			<p class="nav-date">{data.today}</p>
		</div>

		<div class="nav-tabs" role="tablist" aria-label="Main sections">
			<button
				class="tab-btn"
				class:active={activeTab === 'my-day'}
				role="tab"
				aria-selected={activeTab === 'my-day'}
				aria-controls="panel-my-day"
				type="button"
				onclick={() => (activeTab = 'my-day')}
			>
				My day
			</button>
			<button
				class="tab-btn"
				class:active={activeTab === 'timers'}
				role="tab"
				aria-selected={activeTab === 'timers'}
				aria-controls="panel-timers"
				type="button"
				onclick={() => (activeTab = 'timers')}
			>
				Timers
			</button>
		</div>

		<div class="nav-actions">
			<button class="icon-btn" type="button" aria-label="Open settings" onclick={openSettings}>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
					<path
						d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
					/>
					<circle cx="12" cy="12" r="3" />
				</svg>
			</button>
		</div>
	</header>

	{#if activeTab === 'my-day'}
		<div class="my-day-grid" id="panel-my-day" role="tabpanel" aria-label="My day">
			<section class="card pomodoro-card">
				<h2>Pomodoro</h2>
				<div class="mode-toggle-wrap">
					<button
						type="button"
						class:active={currentMode === 'work'}
						class="mode-btn"
						onclick={() => switchMode('work')}>Work</button
					>
					<button
						type="button"
						class:active={currentMode === 'break'}
						class="mode-btn"
						onclick={() => switchMode('break')}>Break</button
					>
					<button
						type="button"
						class:active={currentMode === 'longBreak'}
						class="mode-btn"
						onclick={() => switchMode('longBreak')}>Long Break</button
					>
				</div>

				<p class="clock">{formatClock(timeRemaining)}</p>

				<div class="row">
					<button type="button" class="btn btn-primary" onclick={startPause}>
						{timerStatus === 'running' ? 'Pause' : 'Start'}
					</button>
					<button type="button" class="btn" onclick={resetTimer}>Reset</button>
				</div>

				<label>
					Linked task
					<select bind:value={selectedTaskId}>
						<option value="">No task</option>
						{#each data.tasks as task}
							<option value={task.id}>{task.title}</option>
						{/each}
					</select>
				</label>

				<form method="post" action="?/saveSession" class="session-save">
					<input type="hidden" name="day" value={data.today} />
					<input type="hidden" name="taskId" value={selectedTaskId} />
					<input type="hidden" name="durationMinutes" value={completedDurationMinutes} />
					<input type="hidden" name="startedAt" value={sessionStartedAt} />
					<input type="hidden" name="endedAt" value={sessionEndedAt} />
					<input type="hidden" name="status" value={sessionStatus} />
					<button class="btn" type="submit" disabled={timerStatus !== 'completed'}>
						Save completed session
					</button>
				</form>

				<div class="schedule">
					{#each buildSchedule() as step}
						<div class="schedule-item" class:active={step.isActive}>
							<span>{modeLabel(step.mode)}</span>
							<span>{formatModeDuration(step.mode)}</span>
						</div>
					{/each}
				</div>
			</section>

			<section class="card todos-card">
				<h2>To-dos</h2>
				<form method="post" action="?/addTask" class="row">
					<input type="hidden" name="day" value={data.today} />
					<input name="title" type="text" placeholder="Add a task..." required />
					<button class="btn btn-primary" type="submit">Add</button>
				</form>

				<form method="post" action="?/carryUnfinished">
					<input type="hidden" name="fromDay" value={data.today} />
					<button class="btn" type="submit">Move unfinished to tomorrow</button>
				</form>

				<ul>
					{#if data.tasks.length === 0}
						<li class="list-item">No tasks yet.</li>
					{/if}
					{#each data.tasks as task}
						<li class="list-item">
							<form method="post" action="?/toggleTask" class="row">
								<input type="hidden" name="id" value={task.id} />
								<input type="hidden" name="done" value={task.done ? 'false' : 'true'} />
								<button class="btn" type="submit">{task.done ? 'Mark open' : 'Mark done'}</button>
							</form>

							<form method="post" action="?/updateTask" class="row">
								<input type="hidden" name="id" value={task.id} />
								<input name="title" value={task.title} required />
								<button class="btn" type="submit">Save</button>
							</form>

							<form method="post" action="?/deleteTask">
								<input type="hidden" name="id" value={task.id} />
								<button class="btn" type="submit">Delete</button>
							</form>
						</li>
					{/each}
				</ul>
			</section>

			<section class="card dump-card">
				<h2>Dump</h2>
				<form method="post" action="?/saveNote">
					<input type="hidden" name="day" value={data.today} />
					<textarea name="content" rows="10" placeholder="Drop your notes here...">{data.note}</textarea>
					<button class="btn" type="submit">Save note</button>
				</form>
			</section>
		</div>
	{:else}
		<div class="card timers-panel" id="panel-timers" role="tabpanel" aria-label="Timers">
			<h2>Timers</h2>
			<p>Empty for now (v2).</p>
		</div>
	{/if}

	<Modal open={settingsOpen} title="Settings" onClose={closeSettings}>
		<div class="modal-settings-layout">
			<section class="card" data-elevated="false">
				<h3>Pomodoro Customization</h3>
				<div class="shortcut-wrap">
					<div class="shortcut-row">
						<span>Work</span>
						<button type="button" class="chip" onclick={() => applyShortcut('work', 15)}>15m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('work', 25)}>25m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('work', 45)}>45m</button>
					</div>
					<div class="shortcut-row">
						<span>Break</span>
						<button type="button" class="chip" onclick={() => applyShortcut('break', 2)}>2m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('break', 5)}>5m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('break', 15)}>15m</button>
					</div>
					<div class="shortcut-row">
						<span>Long</span>
						<button type="button" class="chip" onclick={() => applyShortcut('longBreak', 25)}>25m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('longBreak', 45)}>45m</button>
						<button type="button" class="chip" onclick={() => applyShortcut('longBreak', 60)}>60m</button>
					</div>
				</div>

				<form method="post" action="?/saveUiSettings" class="settings-grid">
					<label>
						Work (min)
						<input name="workMinutes" type="number" min="1" max="120" bind:value={workMinutes} />
					</label>
					<label>
						Break (min)
						<input name="breakMinutes" type="number" min="1" max="60" bind:value={breakMinutes} />
					</label>
					<label>
						Long Break (min)
						<input name="longBreakMinutes" type="number" min="1" max="120" bind:value={longBreakMinutes} />
					</label>
					<label>
						Long break every
						<input name="longBreakInterval" type="number" min="1" max="20" bind:value={longBreakInterval} />
					</label>
					<label class="hue-label">
						Theme hue
						<input name="themeHue" type="range" min="0" max="360" bind:value={currentHue} />
					</label>
					<button class="btn btn-personal btn-full" type="submit" disabled={timerStatus === 'running'}>
						Save settings
					</button>
				</form>
			</section>

			<section class="card" data-elevated="false">
				<h3>Notion Settings</h3>
				<form method="post" action="?/saveNotionConfig" class="settings-grid">
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
					<label>
						Task title property
						<input type="text" name="taskTitleProperty" value={data.notionConfig.taskFieldMap.title} />
					</label>
					<label>
						Task done property
						<input type="text" name="taskDoneProperty" value={data.notionConfig.taskFieldMap.done} />
					</label>
					<label>
						Task day property
						<input type="text" name="taskDayProperty" value={data.notionConfig.taskFieldMap.day} />
					</label>
					<label>
						Task carried-over property
						<input
							type="text"
							name="taskCarriedOverProperty"
							value={data.notionConfig.taskFieldMap.carriedOver}
						/>
					</label>
					<label>
						Note title property
						<input type="text" name="noteTitleProperty" value={data.notionConfig.noteFieldMap.title} />
					</label>
					<label>
						Note content property
						<input type="text" name="noteContentProperty" value={data.notionConfig.noteFieldMap.content} />
					</label>
					<label>
						Note day property
						<input type="text" name="noteDayProperty" value={data.notionConfig.noteFieldMap.day} />
					</label>
					<button class="btn" type="submit">Save Notion settings</button>
				</form>

				<form method="post" action="?/syncNotion">
					<button class="btn btn-primary" type="submit">Sync now</button>
				</form>
			</section>
		</div>
	</Modal>

	{#if form?.message}
		<Toast message={form.message} tone={getToastTone(form.message)} stamp={form} />
	{/if}
</main>

<style>
	.page-shell {
		max-width: 960px;
		margin: 0 auto;
		padding: var(--app-space-xl) var(--app-space-md);
		display: grid;
		gap: var(--app-space-md);
	}

	.card {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-lg);
		padding: var(--app-space-md);
		background: var(--app-clr-surface-card);
		box-shadow: var(--app-shadow-medium);
		display: grid;
		gap: var(--app-space-sm);
		transition: background-color 0.4s ease;
	}

	.card[data-elevated='false'] {
		box-shadow: none;
	}

	.top-nav {
		min-height: var(--app-nav-height);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--app-space-md);
	}

	.nav-brand {
		display: grid;
		gap: 0.1rem;
		align-self: stretch;
	}

	.nav-date {
		color: var(--app-clr-on-surface-text-muted);
		font-size: 0.8rem;
	}

	.nav-tabs {
		display: flex;
		gap: var(--app-space-xs);
		align-items: center;
		justify-content: center;
	}

	.nav-actions {
		display: flex;
		justify-content: flex-end;
	}

	.tab-btn,
	.icon-btn {
		font: inherit;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text-secondary);
		box-shadow: var(--app-shadow-small);
		cursor: pointer;
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			background-color var(--app-transition-fast),
			color var(--app-transition-fast);
	}

	.tab-btn {
		padding: 0.45rem 0.75rem;
		font-size: var(--app-text-sm);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.tab-btn.active {
		background: var(--app-clr-action-primary);
		color: var(--app-clr-action-primary-text);
		box-shadow: var(--app-shadow-interactive-press);
	}

	.icon-btn {
		width: 2.25rem;
		height: 2.25rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.tab-btn:hover:not(.active),
	.icon-btn:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
		color: var(--app-clr-on-surface-text);
	}

	.tab-btn:active,
	.icon-btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.my-day-grid {
		display: grid;
		grid-template-columns: 1.15fr 1fr;
		grid-template-areas:
			'pomodoro todos'
			'pomodoro dump';
		gap: var(--app-space-md);
		align-items: stretch;
	}

	.pomodoro-card {
		grid-area: pomodoro;
	}

	.todos-card {
		grid-area: todos;
	}

	.dump-card {
		grid-area: dump;
	}

	.timers-panel {
		min-height: 50vh;
		align-content: start;
	}

	.modal-settings-layout {
		display: grid;
		gap: var(--app-space-md);
	}

	.modal-settings-layout h3 {
		margin: 0;
		font-size: var(--app-text-lg);
	}

	h1,
	h2 {
		margin: 0;
	}

	h1 {
		font-size: var(--app-text-xl);
	}

	p {
		margin: 0;
	}

	.mode-toggle-wrap {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--app-space-xs);
	}

	.mode-btn {
		font: inherit;
		font-size: var(--app-text-sm);
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		padding: var(--app-space-sm) var(--app-space-md);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text-secondary);
		cursor: pointer;
		box-shadow: var(--app-shadow-small);
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			background-color var(--app-transition-fast),
			color var(--app-transition-fast);
	}

	.mode-btn.active {
		color: white;
		box-shadow: var(--app-shadow-interactive-press);
	}

	.mode-btn:hover:not(.active) {
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.mode-btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.page-shell[data-mode='work'] .mode-btn.active {
		background: var(--app-clr-work);
	}

	.page-shell[data-mode='break'] .mode-btn.active {
		background: var(--app-clr-break);
	}

	.page-shell[data-mode='longBreak'] .mode-btn.active {
		background: var(--app-clr-long-break);
	}

	.clock {
		font-family: var(--app-font-mono);
		font-size: var(--app-text-timer);
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	form {
		display: grid;
		gap: var(--app-space-sm);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--app-space-sm);
	}

	label {
		display: grid;
		gap: var(--app-space-xs);
		color: var(--app-clr-on-surface-text-secondary);
	}

	input,
	select,
	textarea,
	button {
		font: inherit;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: 0.45rem 0.55rem;
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
	}

	select {
		-webkit-appearance: none;
		appearance: none;
		padding-right: 2rem;
		background-image:
			linear-gradient(45deg, transparent 50%, var(--app-clr-on-surface-text-secondary) 50%),
			linear-gradient(135deg, var(--app-clr-on-surface-text-secondary) 50%, transparent 50%);
		background-position:
			calc(100% - 14px) calc(50% - 2px),
			calc(100% - 8px) calc(50% - 2px);
		background-size: 6px 6px, 6px 6px;
		background-repeat: no-repeat;
	}

	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		padding: 0;
		height: 0.5rem;
		border-radius: var(--app-radius-sm);
		border: var(--app-border-thick);
		background:
			linear-gradient(
				to right,
				hsl(0 100% 50%),
				hsl(60 100% 50%),
				hsl(120 100% 50%),
				hsl(180 100% 50%),
				hsl(240 100% 50%),
				hsl(300 100% 50%),
				hsl(360 100% 50%)
			);
		cursor: pointer;
		outline: none;
	}

	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 1.125rem;
		height: 1.125rem;
		border-radius: var(--app-radius-sm);
		background: #fff;
		border: var(--app-border-thick);
		box-shadow: 2px 2px 0 #b0b1c0;
		transition: border-color var(--app-transition-fast), box-shadow var(--app-transition-fast);
	}

	input[type='range']::-moz-range-thumb {
		width: 1.125rem;
		height: 1.125rem;
		border-radius: var(--app-radius-sm);
		background: #fff;
		border: var(--app-border-thick);
		box-shadow: 2px 2px 0 #b0b1c0;
		transition: border-color var(--app-transition-fast), box-shadow var(--app-transition-fast);
	}

	input[type='range']::-moz-range-track {
		height: 0.5rem;
		border-radius: var(--app-radius-sm);
		border: var(--app-border-thick);
		background:
			linear-gradient(
				to right,
				hsl(0 100% 50%),
				hsl(60 100% 50%),
				hsl(120 100% 50%),
				hsl(180 100% 50%),
				hsl(240 100% 50%),
				hsl(300 100% 50%),
				hsl(360 100% 50%)
			);
	}

	input[type='range']:hover::-webkit-slider-thumb,
	input[type='range']:hover::-moz-range-thumb {
		border-color: var(--app-clr-on-surface-text-secondary);
	}

	.btn {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: 0.45rem 0.75rem;
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-small);
		cursor: pointer;
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			background-color var(--app-transition-fast);
	}

	.btn:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
		transform: none;
		box-shadow: var(--app-shadow-small);
	}

	.btn-primary {
		background: var(--app-clr-action-primary);
		color: var(--app-clr-action-primary-text);
	}

	.btn-personal {
		background: var(--app-clr-work);
		color: #ffffff;
	}

	.btn-full {
		width: 100%;
	}

	.settings-grid {
		display: grid;
		gap: var(--app-space-sm);
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
	}

	.hue-label {
		grid-column: 1 / -1;
	}

	.shortcut-wrap {
		display: grid;
		gap: var(--app-space-xs);
	}

	.shortcut-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--app-space-xs);
		color: var(--app-clr-on-surface-text-secondary);
	}

	.chip {
		font-family: var(--app-font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
		padding: 0.25rem 0.5rem;
		cursor: pointer;
		box-shadow: var(--app-shadow-small);
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			color var(--app-transition-fast),
			border-color var(--app-transition-fast);
	}

	.chip:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.chip:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.shortcut-row:first-child .chip:hover {
		border-color: var(--app-clr-work);
		color: var(--app-clr-work);
	}

	.shortcut-row:nth-child(2) .chip:hover {
		border-color: var(--app-clr-break);
		color: var(--app-clr-break);
	}

	.shortcut-row:nth-child(3) .chip:hover {
		border-color: var(--app-clr-long-break);
		color: var(--app-clr-long-break);
	}

	.session-save {
		margin-top: var(--app-space-xs);
	}

	.schedule {
		display: grid;
		gap: 2px;
	}

	.schedule-item {
		display: flex;
		justify-content: space-between;
		padding: 0.3rem 0.45rem;
		border-radius: var(--app-radius-sm);
		color: var(--app-clr-on-surface-text-muted);
		background: color-mix(in oklab, var(--app-clr-surface-raised) 55%, transparent);
	}

	.schedule-item.active {
		color: var(--app-clr-on-surface-text);
		font-weight: 600;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--app-space-sm);
	}

	.list-item {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: var(--app-space-sm);
		display: grid;
		gap: var(--app-space-sm);
		background: color-mix(in oklab, var(--app-clr-surface-raised) 62%, transparent);
	}

	@media (max-width: 980px) {
		.my-day-grid {
			grid-template-columns: 1fr;
			grid-template-areas:
				'pomodoro'
				'todos'
				'dump';
		}

		.top-nav {
			grid-template-columns: 1fr;
			justify-items: center;
		}

		.nav-actions {
			width: 100%;
			justify-content: center;
		}

		.nav-brand {
			justify-items: center;
		}
	}

	input:focus-visible,
	select:focus-visible,
	textarea:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--app-clr-focus-ring);
		outline-offset: 2px;
	}
</style>
