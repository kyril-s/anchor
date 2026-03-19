<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy, untrack } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import type { ActionData, PageData } from './$types';

	type Mode = 'work' | 'break' | 'longBreak';
	type MainTab = 'my-day' | 'timers';
	type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
	type SettingsTab = 'preferences' | 'pomodoro' | 'notion';
	type TimersWarningLevel = 'none' | 'warning' | 'critical' | 'completed';
	type CustomTimer = {
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
	type CustomTimersState = {
		timers: CustomTimer[];
		activeTimerId: string | null;
		timerNotice: string;
	};
	const DEFAULT_MAIN_TAB: MainTab = 'my-day';
	const DEFAULT_THEME_HUE = 330.216;
	const DEFAULT_WORK_MINUTES = 25;
	const DEFAULT_BREAK_MINUTES = 5;
	const DEFAULT_LONG_BREAK_MINUTES = 25;
	const DEFAULT_LONG_BREAK_INTERVAL = 4;
	const UI_SETTINGS_SAVE_DEBOUNCE_MS = 400;
	const NOTION_SETTINGS_SAVE_DEBOUNCE_MS = 500;
	const CUSTOM_TIMERS_SAVE_DEBOUNCE_MS = 600;

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const uiSettings = untrack(() => data.uiSettings);
	const customTimersState = untrack(() => data.customTimersState as CustomTimersState | undefined);

	let currentHue = $state(uiSettings.themeHue);
	let workMinutes = $state(uiSettings.workMinutes);
	let breakMinutes = $state(uiSettings.breakMinutes);
	let longBreakMinutes = $state(uiSettings.longBreakMinutes);
	let longBreakInterval = $state(uiSettings.longBreakInterval);
	let selectedTaskId = $state(untrack(() => data.tasks[0]?.id?.toString() ?? ''));
	let activeTab = $state<MainTab>(getInitialMainTab());
	let settingsOpen = $state(false);
let settingsTab = $state<SettingsTab>('preferences');
	let startDayPromptOpen = $state(false);
	let finishDayPromptOpen = $state(false);

	const workSeconds = $derived(workMinutes * 60);
	const breakSeconds = $derived(breakMinutes * 60);
	const longBreakSeconds = $derived(longBreakMinutes * 60);
	let completedWorkSessions = $state(0);

	let currentMode = $state<Mode>('work');
	let timeRemaining = $state(untrack(() => workSeconds));
	let timerStatus = $state<TimerStatus>('idle');
	let timerHandle: ReturnType<typeof setInterval> | null = null;
	let uiSettingsSaveHandle: ReturnType<typeof setTimeout> | null = null;
	let notionSettingsSaveHandle: ReturnType<typeof setTimeout> | null = null;
	let customTimerHandle: ReturnType<typeof setInterval> | null = null;
	let customTimersSaveHandle: ReturnType<typeof setTimeout> | null = null;
	let hasHydratedCustomTimersState = false;
	let lastCustomTimersSignature = '';
	let lastPersistedCustomTimersSignature = '';

	let timerDraftName = $state('');
	let timerDraftDurationMinutes = $state(25);
	let timerDraftWarningMinutes = $state(5);
	let timerDraftCriticalMinutes = $state(1);
	let customTimers = $state<CustomTimer[]>(customTimersState?.timers ?? []);
	let activeCustomTimerId = $state<string | null>(customTimersState?.activeTimerId ?? null);
	let timerNotice = $state(customTimersState?.timerNotice ?? '');
	let customTimerCounter = 0;
	let draggedTimerId = $state<string | null>(null);
	let dragOverTimerId = $state<string | null>(null);
	let dragDropPosition = $state<'before' | 'after' | null>(null);

	let sessionStartedAt = $state('');
	let sessionEndedAt = $state('');
	let sessionStatus = $state('completed');
	let completedDurationMinutes = $state(untrack(() => workMinutes));

	const modeOrder: Mode[] = ['work', 'break', 'longBreak'];

	function clamp(value: number, min: number, max: number) {
		return Math.max(min, Math.min(max, value));
	}

	function parseMainTab(value: string | null) {
		return value === 'my-day' || value === 'timers' ? value : null;
	}

	function readMainTabFromLocation() {
		if (typeof window === 'undefined') return DEFAULT_MAIN_TAB;
		const params = new URLSearchParams(window.location.search);
		return parseMainTab(params.get('tab')) ?? DEFAULT_MAIN_TAB;
	}

	function getInitialMainTab() {
		return readMainTabFromLocation();
	}

	function writeMainTabToUrl(tab: MainTab) {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('tab', tab);
		const nextPath = `${url.pathname}${url.search}${url.hash}`;
		const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
		if (nextPath === currentPath) return;
		window.history.replaceState(window.history.state, '', nextPath);
	}

	function setActiveTab(tab: MainTab) {
		activeTab = tab;
		writeMainTabToUrl(tab);
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
			root.setProperty('--app-clr-surface-input', hsl(h, 24, 10));
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
			root.setProperty('--app-clr-surface-input', hsl(h, 10, 94));
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

	function clearUiSettingsSaveHandle() {
		if (!uiSettingsSaveHandle) return;
		clearTimeout(uiSettingsSaveHandle);
		uiSettingsSaveHandle = null;
	}

	function clearNotionSettingsSaveHandle() {
		if (!notionSettingsSaveHandle) return;
		clearTimeout(notionSettingsSaveHandle);
		notionSettingsSaveHandle = null;
	}

	function stopCustomTimerInterval() {
		if (!customTimerHandle) return;
		clearInterval(customTimerHandle);
		customTimerHandle = null;
	}

	function clearCustomTimersSaveHandle() {
		if (!customTimersSaveHandle) return;
		clearTimeout(customTimersSaveHandle);
		customTimersSaveHandle = null;
	}

	function getCustomTimersPersistencePayload(): CustomTimersState {
		return {
			timers: customTimers,
			activeTimerId: activeCustomTimerId,
			timerNotice
		};
	}

	async function persistCustomTimersState(options?: { keepalive?: boolean }) {
		const signature = JSON.stringify(getCustomTimersPersistencePayload());
		if (signature === lastPersistedCustomTimersSignature) return;

		const formData = new FormData();
		formData.set('state', signature);
		try {
			await fetch('?/saveCustomTimers', {
				method: 'POST',
				body: formData,
				keepalive: Boolean(options?.keepalive)
			});
			lastPersistedCustomTimersSignature = signature;
		} catch {
			// Keep the timers responsive; state will retry on the next change.
		}
	}

	function queueCustomTimersStateSave() {
		clearCustomTimersSaveHandle();
		customTimersSaveHandle = setTimeout(() => {
			void persistCustomTimersState();
		}, CUSTOM_TIMERS_SAVE_DEBOUNCE_MS);
	}

	function normalizeTimerName(value: string) {
		const trimmed = value.trim();
		if (trimmed) return trimmed;
		return `Timer ${customTimers.length + 1}`;
	}

	function getCustomTimer(id: string) {
		return customTimers.find((timer) => timer.id === id) ?? null;
	}

	function toWholeMinutes(value: number, fallback: number, min: number, max: number) {
		const safe = Number.isFinite(value) ? Math.floor(value) : fallback;
		return clamp(safe, min, max);
	}

	function normalizeTimerDraftValues() {
		timerDraftDurationMinutes = toWholeMinutes(timerDraftDurationMinutes, 25, 1, 600);
		timerDraftWarningMinutes = toWholeMinutes(
			timerDraftWarningMinutes,
			5,
			0,
			timerDraftDurationMinutes - 1
		);
		timerDraftCriticalMinutes = toWholeMinutes(
			timerDraftCriticalMinutes,
			1,
			0,
			timerDraftDurationMinutes - 1
		);
	}

	function createCustomTimer() {
		normalizeTimerDraftValues();
		const durationMinutes = timerDraftDurationMinutes;
		const warningMinutes = Math.min(timerDraftWarningMinutes, durationMinutes - 1);
		const criticalMinutes = Math.min(timerDraftCriticalMinutes, durationMinutes - 1);
		const id = `timer-${Date.now()}-${customTimerCounter++}`;
		const totalSeconds = durationMinutes * 60;

		const nextTimer: CustomTimer = {
			id,
			name: normalizeTimerName(timerDraftName),
			totalSeconds,
			remainingSeconds: totalSeconds,
			status: 'idle',
			warningAtSeconds: warningMinutes > 0 ? warningMinutes * 60 : null,
			criticalAtSeconds: criticalMinutes > 0 ? criticalMinutes * 60 : null,
			warningTriggered: false,
			criticalTriggered: false
		};

		customTimers = [nextTimer, ...customTimers];
		timerDraftName = '';
		timerNotice = '';
	}

	function pauseAllCustomTimers() {
		customTimers = customTimers.map((timer) => {
			if (timer.status !== 'running') return timer;
			return { ...timer, status: 'paused' };
		});
	}

	function getCustomTimerWarningLevel(timer: CustomTimer): TimersWarningLevel {
		if (timer.status === 'completed') return 'completed';
		if (timer.criticalTriggered) return 'critical';
		if (timer.warningTriggered) return 'warning';
		return 'none';
	}

	function getCustomTimerWarningMessage(timer: CustomTimer) {
		const level = getCustomTimerWarningLevel(timer);
		if (level === 'critical') return 'Critical window';
		if (level === 'warning') return 'Warning window';
		if (level === 'completed') return 'Completed';
		return 'Normal';
	}

	function resetWarningState(timer: CustomTimer) {
		return {
			...timer,
			warningTriggered: false,
			criticalTriggered: false
		};
	}

	function runCustomTimer(id: string) {
		const timer = getCustomTimer(id);
		if (!timer) return;

		stopCustomTimerInterval();
		pauseAllCustomTimers();
		activeCustomTimerId = id;
		timerNotice = '';

		customTimers = customTimers.map((item) => {
			if (item.id !== id) return item;
			if (item.status === 'completed' || item.remainingSeconds <= 0) {
				const resetItem = resetWarningState({ ...item, remainingSeconds: item.totalSeconds });
				return { ...resetItem, status: 'running' };
			}
			return { ...item, status: 'running' };
		});

		customTimerHandle = setInterval(tickCustomTimer, 1000);
	}

	function pauseCustomTimer(id: string) {
		const timer = getCustomTimer(id);
		if (!timer || timer.status !== 'running') return;
		stopCustomTimerInterval();
		customTimers = customTimers.map((item) =>
			item.id === id ? { ...item, status: 'paused' } : item
		);
		if (activeCustomTimerId === id) activeCustomTimerId = null;
	}

	function toggleCustomTimer(id: string) {
		const timer = getCustomTimer(id);
		if (!timer) return;
		if (timer.status === 'running') {
			pauseCustomTimer(id);
			return;
		}
		runCustomTimer(id);
	}

	function resetCustomTimer(id: string) {
		const timer = getCustomTimer(id);
		if (!timer) return;
		if (activeCustomTimerId === id) {
			stopCustomTimerInterval();
			activeCustomTimerId = null;
		}
		customTimers = customTimers.map((item) => {
			if (item.id !== id) return item;
			const resetItem = resetWarningState(item);
			return {
				...resetItem,
				remainingSeconds: item.totalSeconds,
				status: 'idle'
			};
		});
		timerNotice = '';
	}

	function removeCustomTimer(id: string) {
		if (activeCustomTimerId === id) {
			stopCustomTimerInterval();
			activeCustomTimerId = null;
		}
		customTimers = customTimers.filter((item) => item.id !== id);
		timerNotice = '';
	}

	function clearTimerDragState() {
		draggedTimerId = null;
		dragOverTimerId = null;
		dragDropPosition = null;
	}

	function getDragDropPosition(event: DragEvent): 'before' | 'after' {
		const target = event.currentTarget;
		if (!(target instanceof HTMLElement)) return 'after';
		const { top, height } = target.getBoundingClientRect();
		const offsetY = event.clientY - top;
		return offsetY < height / 2 ? 'before' : 'after';
	}

	function reorderCustomTimers(draggedId: string, targetId: string, position: 'before' | 'after') {
		const fromIndex = customTimers.findIndex((timer) => timer.id === draggedId);
		const targetIndex = customTimers.findIndex((timer) => timer.id === targetId);
		if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) return;

		const next = [...customTimers];
		const [moved] = next.splice(fromIndex, 1);
		let insertIndex = targetIndex + (position === 'after' ? 1 : 0);
		if (fromIndex < insertIndex) insertIndex -= 1;
		next.splice(insertIndex, 0, moved);
		customTimers = next;
	}

	function commitTimerDrop() {
		if (!draggedTimerId || !dragOverTimerId || !dragDropPosition) {
			clearTimerDragState();
			return;
		}
		reorderCustomTimers(draggedTimerId, dragOverTimerId, dragDropPosition);
		clearTimerDragState();
	}

	function onTimerDragStart(event: DragEvent, timerId: string) {
		const target = event.target;
		// Allow drag from most of the card, but keep action buttons clickable.
		if (target instanceof HTMLElement && target.closest('.timers-item-actions')) {
			event.preventDefault();
			return;
		}

		draggedTimerId = timerId;
		dragOverTimerId = null;
		dragDropPosition = null;

		if (!event.dataTransfer) return;
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', timerId);
	}

	function onTimerDragOver(event: DragEvent, timerId: string) {
		if (!draggedTimerId || draggedTimerId === timerId) return;
		event.preventDefault();
		dragOverTimerId = timerId;
		dragDropPosition = getDragDropPosition(event);
	}

	function onTimerDrop(event: DragEvent, timerId: string) {
		event.preventDefault();
		if (!draggedTimerId || draggedTimerId === timerId) {
			clearTimerDragState();
			return;
		}
		dragOverTimerId = timerId;
		dragDropPosition = getDragDropPosition(event);
		commitTimerDrop();
	}

	function onTimerDragEnd() {
		clearTimerDragState();
	}

	function onTimersListDragOver(event: DragEvent) {
		if (!draggedTimerId) return;
		event.preventDefault();
		const target = event.target;
		if (target instanceof HTMLElement && target.closest('.timers-item')) return;
		const lastTimer = customTimers.at(-1);
		if (!lastTimer || lastTimer.id === draggedTimerId) return;
		dragOverTimerId = lastTimer.id;
		dragDropPosition = 'after';
	}

	function onTimersListDrop(event: DragEvent) {
		if (!draggedTimerId) return;
		event.preventDefault();
		commitTimerDrop();
	}

	function tickCustomTimer() {
		if (!activeCustomTimerId) {
			stopCustomTimerInterval();
			return;
		}

		let completedTimerName = '';
		let warningNotice = '';
		let hasRunningTimer = false;
		const activeId = activeCustomTimerId;

		customTimers = customTimers.map((timer) => {
			if (timer.id !== activeId || timer.status !== 'running') return timer;
			hasRunningTimer = true;
			const nextRemaining = Math.max(0, timer.remainingSeconds - 1);
			let nextTimer = { ...timer, remainingSeconds: nextRemaining };

			if (
				nextTimer.criticalAtSeconds !== null &&
				!nextTimer.criticalTriggered &&
				nextRemaining <= nextTimer.criticalAtSeconds
			) {
				nextTimer = { ...nextTimer, criticalTriggered: true, warningTriggered: true };
				warningNotice = `${nextTimer.name}: critical threshold reached.`;
			} else if (
				nextTimer.warningAtSeconds !== null &&
				!nextTimer.warningTriggered &&
				nextRemaining <= nextTimer.warningAtSeconds
			) {
				nextTimer = { ...nextTimer, warningTriggered: true };
				warningNotice = `${nextTimer.name}: warning threshold reached.`;
			}

			if (nextRemaining === 0) {
				completedTimerName = nextTimer.name;
				nextTimer = { ...nextTimer, status: 'completed', warningTriggered: true, criticalTriggered: true };
			}

			return nextTimer;
		});

		if (!hasRunningTimer) {
			stopCustomTimerInterval();
			activeCustomTimerId = null;
			return;
		}

		if (completedTimerName) {
			stopCustomTimerInterval();
			activeCustomTimerId = null;
			timerNotice = `${completedTimerName} finished.`;
			return;
		}

		if (warningNotice) {
			timerNotice = warningNotice;
		}
	}

	const activeCustomTimer = $derived(
		activeCustomTimerId ? (customTimers.find((timer) => timer.id === activeCustomTimerId) ?? null) : null
	);

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

		// Keep paused timers at their current remaining time.
		if (timerStatus === 'idle') {
			timeRemaining = secondsForMode(currentMode);
		}
	}

	function applyPreferenceSettings() {
		currentHue = clamp(Math.floor(currentHue || DEFAULT_THEME_HUE), 0, 360);
	}

	async function persistUiSettings() {
		const formData = new FormData();
		formData.set('themeHue', String(currentHue));
		formData.set('workMinutes', String(workMinutes));
		formData.set('breakMinutes', String(breakMinutes));
		formData.set('longBreakMinutes', String(longBreakMinutes));
		formData.set('longBreakInterval', String(longBreakInterval));
		try {
			await fetch('?/saveUiSettings', { method: 'POST', body: formData });
		} catch {
			// Keep the UI responsive; users can retry by changing any value again.
		}
	}

	function queueUiSettingsSave() {
		applyPomodoroSettings();
		applyPreferenceSettings();
		clearUiSettingsSaveHandle();
		uiSettingsSaveHandle = setTimeout(() => {
			void persistUiSettings();
		}, UI_SETTINGS_SAVE_DEBOUNCE_MS);
	}

	function queuePomodoroSettingsSave() {
		applyPomodoroSettings();
		queueUiSettingsSave();
	}

	function queuePreferenceSettingsSave() {
		applyPreferenceSettings();
		queueUiSettingsSave();
	}

async function persistNotionSettings(formElement: HTMLFormElement) {
	const formData = new FormData(formElement);
	try {
		await fetch('?/saveNotionConfig', { method: 'POST', body: formData });
	} catch {
		// Keep the form responsive; users can retry by editing any field again.
	}
}

function queueNotionSettingsSave(event: Event) {
	const formElement = event.currentTarget;
	if (!(formElement instanceof HTMLFormElement)) return;
	clearNotionSettingsSaveHandle();
	notionSettingsSaveHandle = setTimeout(() => {
		void persistNotionSettings(formElement);
	}, NOTION_SETTINGS_SAVE_DEBOUNCE_MS);
}

	function applyShortcut(mode: Mode, minutes: number) {
		if (timerStatus === 'running') return;
		if (mode === 'work') workMinutes = minutes;
		if (mode === 'break') breakMinutes = minutes;
		if (mode === 'longBreak') longBreakMinutes = minutes;
		queueUiSettingsSave();
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
		settingsTab = 'preferences';
		settingsOpen = true;
	}

	function closeSettings() {
		settingsOpen = false;
	}

	function openStartDayPrompt() {
		if (data.dayStarted) {
			finishDayPromptOpen = true;
			return;
		}
		startDayPromptOpen = true;
	}

	function closeStartDayPrompt() {
		startDayPromptOpen = false;
	}

	function closeFinishDayPrompt() {
		finishDayPromptOpen = false;
	}

	function applyStartDayDefaults() {
		stopInterval();
		clearUiSettingsSaveHandle();
		currentHue = DEFAULT_THEME_HUE;
		workMinutes = DEFAULT_WORK_MINUTES;
		breakMinutes = DEFAULT_BREAK_MINUTES;
		longBreakMinutes = DEFAULT_LONG_BREAK_MINUTES;
		longBreakInterval = DEFAULT_LONG_BREAK_INTERVAL;
		timerStatus = 'idle';
		currentMode = 'work';
		timeRemaining = DEFAULT_WORK_MINUTES * 60;
		clearSessionDraft();
		completedDurationMinutes = DEFAULT_WORK_MINUTES;
		completedWorkSessions = 0;
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

	function submitTaskTitleInput(input: HTMLInputElement | null, originalTitle: string) {
		if (!input) return;
		const nextTitle = input.value.trim();
		const normalizedOriginal = originalTitle.trim();
		if (!nextTitle) {
			input.value = normalizedOriginal;
			return;
		}
		if (nextTitle === normalizedOriginal) return;
		input.value = nextTitle;
		input.form?.requestSubmit();
	}

	function autosaveTaskTitleOnBlur(event: FocusEvent, originalTitle: string) {
		submitTaskTitleInput(event.currentTarget as HTMLInputElement | null, originalTitle);
	}

	function autosaveTaskTitleOnKeydown(event: KeyboardEvent, originalTitle: string) {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const input = event.currentTarget as HTMLInputElement | null;
		submitTaskTitleInput(input, originalTitle);
		input?.blur();
	}

	function truncateLabel(value: string, maxLength: number) {
		if (value.length <= maxLength) return value;
		return `${value.slice(0, maxLength - 1)}…`;
	}

	function formatDisplayDate(value: string) {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) return value;
		return parsed.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	const navTitle = $derived(
		truncateLabel(data.user?.name ?? data.user?.email ?? 'Anchor', 12)
	);
	const navDate = $derived(formatDisplayDate(data.today));

	$effect(() => {
		applyTheme();
	});

	$effect(() => {
		applyPomodoroSettings();
	});

	$effect(() => {
		applyPreferenceSettings();
	});

	$effect(() => {
		window.addEventListener('keydown', onKeydown);
		return () => window.removeEventListener('keydown', onKeydown);
	});

	$effect(() => {
		const onPopstate = () => {
			activeTab = readMainTabFromLocation();
		};
		window.addEventListener('popstate', onPopstate);
		return () => window.removeEventListener('popstate', onPopstate);
	});

	$effect(() => {
		if (!form?.message) return;
		if (!form.message.startsWith('Day started')) return;
		closeStartDayPrompt();
		closeFinishDayPrompt();
		applyStartDayDefaults();
	});

	$effect(() => {
		if (!form?.message) return;
		if (!form.message.startsWith('Day finished')) return;
		closeStartDayPrompt();
		closeFinishDayPrompt();
	});

	$effect(() => {
		const signature = JSON.stringify(getCustomTimersPersistencePayload());
		if (!hasHydratedCustomTimersState) {
			hasHydratedCustomTimersState = true;
			lastCustomTimersSignature = signature;
			lastPersistedCustomTimersSignature = signature;
			return;
		}
		if (signature === lastCustomTimersSignature) return;
		lastCustomTimersSignature = signature;
		queueCustomTimersStateSave();
	});

	$effect(() => {
		const flushPendingCustomTimersState = () => {
			clearCustomTimersSaveHandle();
			void persistCustomTimersState({ keepalive: true });
		};
		const onVisibilityChange = () => {
			if (document.visibilityState !== 'hidden') return;
			flushPendingCustomTimersState();
		};

		window.addEventListener('pagehide', flushPendingCustomTimersState);
		window.addEventListener('beforeunload', flushPendingCustomTimersState);
		document.addEventListener('visibilitychange', onVisibilityChange);

		return () => {
			window.removeEventListener('pagehide', flushPendingCustomTimersState);
			window.removeEventListener('beforeunload', flushPendingCustomTimersState);
			document.removeEventListener('visibilitychange', onVisibilityChange);
		};
	});

	onDestroy(() => {
		stopInterval();
		clearUiSettingsSaveHandle();
		clearNotionSettingsSaveHandle();
		stopCustomTimerInterval();
		clearCustomTimersSaveHandle();
	});
</script>

<main class="page-shell" data-mode={currentMode} data-running={timerStatus === 'running'}>
	<header class="top-nav-wrap">
		<div class="top-nav">
			<div class="nav-brand">
				<h1>{navTitle}</h1>
				<p class="nav-date">{navDate}</p>
			</div>

			<div class="nav-tabs" role="tablist" aria-label="Main sections">
				<button
					class="tab-btn"
					class:active={activeTab === 'my-day'}
					role="tab"
					aria-selected={activeTab === 'my-day'}
					aria-controls="panel-my-day"
					type="button"
					onclick={() => setActiveTab('my-day')}
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
					onclick={() => setActiveTab('timers')}
				>
					Timers
				</button>
			</div>

			<div class="nav-actions">
				<button
					class="icon-btn"
					class:active={data.dayStarted}
					type="button"
					aria-label={data.dayStarted ? 'Finish day' : 'Start day'}
					title={data.dayStarted ? 'Finish day' : 'Start day'}
					onclick={openStartDayPrompt}
				>
					{#if data.dayStarted}
						<svg
							viewBox="0 0 24 24"
							width="18"
							height="18"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<path d="M21 12.79A9 9 0 1 1 11.21 3c-.01.26-.01.52-.01.79A8 8 0 0 0 20 12c.27 0 .53 0 .79-.01z" />
						</svg>
					{:else}
						<svg
							viewBox="0 0 24 24"
							width="18"
							height="18"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
						>
							<circle cx="12" cy="12" r="4" />
							<path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
						</svg>
					{/if}
				</button>
				<button class="icon-btn" type="button" aria-label="Open settings" onclick={openSettings}>
					<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
						<path
							d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
						/>
						<circle cx="12" cy="12" r="3" />
					</svg>
				</button>
				<form method="post" action="?/signOut" use:enhance>
					<button class="icon-btn" type="submit" aria-label="Sign out" title="Sign out">
						<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
							<path d="m16 17 5-5-5-5" />
							<path d="M21 12H9" />
						</svg>
					</button>
				</form>
			</div>
		</div>
	</header>

	<section class="page-content">

	<Modal open={startDayPromptOpen} title="Start day" compact onClose={closeStartDayPrompt}>
		<section class="start-day-prompt" aria-label="Start day prompt">
			<h3>Start your day?</h3>
			<p>
				This will clear today&apos;s dump note and reset Pomodoro settings to defaults. Move unfinished
				tasks from yesterday to today?
			</p>
			<div class="row start-day-actions">
				<button class="btn" type="button" onclick={closeStartDayPrompt}>Cancel</button>
				<form method="post" action="?/startDay" use:enhance>
					<input type="hidden" name="day" value={data.today} />
					<input type="hidden" name="moveUnfinished" value="false" />
					<button class="btn" type="submit">Start Day Only</button>
				</form>
				<form
					class="start-day-actions-cta"
					method="post"
					action="?/startDay"
					use:enhance
				>
					<input type="hidden" name="day" value={data.today} />
					<input type="hidden" name="moveUnfinished" value="true" />
					<button class="btn btn-primary" type="submit">Start Day + Move</button>
				</form>
			</div>
		</section>
	</Modal>

	<Modal open={finishDayPromptOpen} title="Finish day" compact onClose={closeFinishDayPrompt}>
		<section class="start-day-prompt" aria-label="Finish day prompt">
			<h3>Finish your day?</h3>
			<p>This will mark your day as finished and switch the day button back to the start state.</p>
			<div class="row start-day-actions">
				<button class="btn" type="button" onclick={closeFinishDayPrompt}>Cancel</button>
				<form class="start-day-actions-cta" method="post" action="?/finishDay" use:enhance>
					<input type="hidden" name="day" value={data.today} />
					<button class="btn btn-primary" type="submit">Finish Day</button>
				</form>
			</div>
		</section>
	</Modal>

	{#if activeTab === 'my-day'}
		<div class="my-day-grid" id="panel-my-day" role="tabpanel" aria-label="My day">
			<section class="card pomodoro-card">
				<div class="section-heading section-heading-pomodoro">
					<h2>Pomodoro</h2>
					<div class="mode-toggle-wrap" role="group" aria-label="Pomodoro modes">
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
				</div>

				<p class="clock">{formatClock(timeRemaining)}</p>

				<div class="row timer-actions">
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

				<form method="post" action="?/saveSession" class="session-save" use:enhance>
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
				<form method="post" action="?/addTask" class="todo-add-row" use:enhance>
					<input type="hidden" name="day" value={data.today} />
					<input name="title" type="text" placeholder="Add a task..." required />
					<button class="task-icon-btn task-icon-btn-primary" type="submit" aria-label="Add task">
						<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M12 5v14M5 12h14" />
						</svg>
					</button>
				</form>

				<ul class="todo-list">
					{#if data.tasks.length === 0}
						<li class="list-item">No tasks yet.</li>
					{/if}
					{#each data.tasks as task}
						<li class="task-row">
							<form method="post" action="?/updateTask" class="task-title-form" use:enhance>
								<input type="hidden" name="id" value={task.id} />
								<input
									class:done={task.done}
									name="title"
									value={task.title}
									required
									onblur={(event) => autosaveTaskTitleOnBlur(event, task.title)}
									onkeydown={(event) => autosaveTaskTitleOnKeydown(event, task.title)}
								/>
							</form>

							<div class="task-row-actions">
								<form method="post" action="?/toggleTask" use:enhance>
									<input type="hidden" name="id" value={task.id} />
									<input type="hidden" name="done" value={task.done ? 'false' : 'true'} />
									<button
										class="task-icon-btn task-icon-btn-success"
										type="submit"
										aria-label={task.done ? 'Mark task as open' : 'Mark task as done'}
										title={task.done ? 'Mark open' : 'Mark done'}
									>
										<svg
											viewBox="0 0 24 24"
											width="16"
											height="16"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path d="m5 12 4 4L19 6" />
										</svg>
									</button>
								</form>

								<form method="post" action="?/deleteTask" use:enhance>
									<input type="hidden" name="id" value={task.id} />
									<button
										class="task-icon-btn task-icon-btn-critical"
										type="submit"
										aria-label="Delete task"
										title="Delete"
									>
										<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
											<path d="m18 6-12 12M6 6l12 12" />
										</svg>
									</button>
								</form>
							</div>
						</li>
					{/each}
				</ul>

				<form method="post" action="?/carryUnfinished" class="todo-carry-row" use:enhance>
					<input type="hidden" name="fromDay" value={data.today} />
					<button class="btn" type="submit">Move unfinished to tomorrow</button>
				</form>
			</section>

			<section class="card dump-card">
				<h2>Dump</h2>
				<form method="post" action="?/saveNote" use:enhance>
					<input type="hidden" name="day" value={data.today} />
					<textarea name="content" rows="10" placeholder="Drop your notes here...">{data.note}</textarea>
					<button class="btn" type="submit">Save note</button>
				</form>
			</section>
		</div>
	{:else}
		<div class="card timers-panel" id="panel-timers" role="tabpanel" aria-label="Timers">
			<div class="section-heading">
				<h2>Timers</h2>
				<p class="timers-summary">{customTimers.length} total</p>
			</div>

			<div class="timers-grid">
				<section class="timers-subcard">
					<h3>Create timer</h3>
					<div class="timers-form-grid">
						<label>
							Name
							<input
								type="text"
								bind:value={timerDraftName}
								placeholder="Design sprint, Deep work..."
								maxlength="60"
							/>
						</label>
						<label>
							Duration (minutes)
							<input type="number" min="1" max="600" bind:value={timerDraftDurationMinutes} />
						</label>
						<label>
							Warning at (minutes left)
							<input type="number" min="0" max="599" bind:value={timerDraftWarningMinutes} />
						</label>
						<label>
							Critical at (minutes left)
							<input type="number" min="0" max="599" bind:value={timerDraftCriticalMinutes} />
						</label>
					</div>
					<button class="btn btn-primary" type="button" onclick={createCustomTimer}>Add timer</button>
				</section>

				<section class="timers-subcard timers-active-card">
					<h3>Remaining time</h3>
					{#if activeCustomTimer}
						<p class="timers-active-name">{activeCustomTimer.name}</p>
						<p class="clock timers-active-clock">{formatClock(activeCustomTimer.remainingSeconds)}</p>
						<p
							class={`timers-active-label timers-active-label-${getCustomTimerWarningLevel(activeCustomTimer)}`}
						>
							{getCustomTimerWarningMessage(activeCustomTimer)}
						</p>
					{:else}
						<p class="timers-empty">No active timer. Start one from the list.</p>
					{/if}
					{#if timerNotice}
						<p class="timers-notice">{timerNotice}</p>
					{/if}
				</section>

				<section class="timers-subcard timers-list-wrap">
					<h3>Timer list</h3>
					{#if customTimers.length === 0}
						<p class="timers-empty">Add your first timer to begin.</p>
					{:else}
						<ul class="timers-list" ondragover={onTimersListDragOver} ondrop={onTimersListDrop}>
							{#each customTimers as timer (timer.id)}
								{#if dragOverTimerId === timer.id && dragDropPosition === 'before'}
									<li class="timers-drop-indicator" aria-hidden="true">
										<div class="timers-drop-line"></div>
									</li>
								{/if}
								<li
									class={`timers-item timers-item-${getCustomTimerWarningLevel(timer)} ${draggedTimerId === timer.id ? 'is-dragging' : ''}`}
									draggable="true"
									ondragstart={(event) => onTimerDragStart(event, timer.id)}
									ondragover={(event) => onTimerDragOver(event, timer.id)}
									ondrop={(event) => onTimerDrop(event, timer.id)}
									ondragend={onTimerDragEnd}
								>
									<div class="timers-item-head">
										<p class="timers-item-name">{timer.name}</p>
										<div class="timers-item-actions">
											<button class="btn btn-primary" type="button" onclick={() => toggleCustomTimer(timer.id)}>
												{timer.status === 'running' ? 'Pause' : 'Start'}
											</button>
											<button class="btn" type="button" onclick={() => resetCustomTimer(timer.id)}>Reset</button>
											<button class="btn" type="button" onclick={() => removeCustomTimer(timer.id)}>Remove</button>
										</div>
									</div>
									<p class="timers-item-clock">
										{formatClock(timer.remainingSeconds)}
										<span>/ {formatClock(timer.totalSeconds)}</span>
									</p>
									<div class="timers-item-meta">
										<span>
											Warn: {timer.warningAtSeconds ? formatClock(timer.warningAtSeconds) : 'off'}
										</span>
										<span>
											Critical: {timer.criticalAtSeconds ? formatClock(timer.criticalAtSeconds) : 'off'}
										</span>
									</div>
								</li>
								{#if dragOverTimerId === timer.id && dragDropPosition === 'after'}
									<li class="timers-drop-indicator" aria-hidden="true">
										<div class="timers-drop-line"></div>
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{/if}
	</section>

	<Modal open={settingsOpen} title="Settings" onClose={closeSettings}>
		<div class="modal-settings-layout">
			<nav class="settings-tabs" aria-label="Settings categories">
				<button
					type="button"
					class="settings-tab"
					class:active={settingsTab === 'preferences'}
					onclick={() => (settingsTab = 'preferences')}
				>
					Preferences
				</button>
				<button
					type="button"
					class="settings-tab"
					class:active={settingsTab === 'pomodoro'}
					onclick={() => (settingsTab = 'pomodoro')}
				>
					Pomodoro
				</button>
				<button
					type="button"
					class="settings-tab"
					class:active={settingsTab === 'notion'}
					onclick={() => (settingsTab = 'notion')}
				>
					Notion
				</button>
			</nav>

			<section class="card settings-panel" data-elevated="false">
				{#if settingsTab === 'preferences'}
					<h3>Preferences</h3>
					<div class="settings-grid">
						<label class="hue-label">
							Theme hue
							<input
								name="themeHue"
								type="range"
								min="0"
								max="360"
								bind:value={currentHue}
								oninput={queuePreferenceSettingsSave}
							/>
						</label>
					</div>
				{:else if settingsTab === 'pomodoro'}
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

					<div class="settings-grid">
						<label>
							Work (min)
							<input
								name="workMinutes"
								type="number"
								min="1"
								max="120"
								bind:value={workMinutes}
								oninput={queuePomodoroSettingsSave}
							/>
						</label>
						<label>
							Break (min)
							<input
								name="breakMinutes"
								type="number"
								min="1"
								max="60"
								bind:value={breakMinutes}
								oninput={queuePomodoroSettingsSave}
							/>
						</label>
						<label>
							Long Break (min)
							<input
								name="longBreakMinutes"
								type="number"
								min="1"
								max="120"
								bind:value={longBreakMinutes}
								oninput={queuePomodoroSettingsSave}
							/>
						</label>
						<label>
							Long break every
							<input
								name="longBreakInterval"
								type="number"
								min="1"
								max="20"
								bind:value={longBreakInterval}
								oninput={queuePomodoroSettingsSave}
							/>
						</label>
					</div>
				{:else}
					<h3>Notion Settings</h3>
					<form
						method="post"
						action="?/saveNotionConfig"
						class="notion-settings-form"
						use:enhance
						oninput={queueNotionSettingsSave}
					>
						<fieldset class="notion-group">
							<legend>Connection</legend>
							<p class="notion-help">
								Already connected to Notion? You can leave this blank and we will keep using the API
								key you already saved.
							</p>
							<label>
								Notion secret key
								<input
									type="password"
									name="notionApiKey"
									placeholder={data.notionConfig.hasApiKey ? '********' : 'secret_xxx'}
								/>
							</label>
						</fieldset>

						<fieldset class="notion-group">
							<legend>Databases</legend>
							<div class="settings-grid notion-grid-two">
								<label>
									Tasks database ID
									<input type="text" name="tasksDbId" value={data.notionConfig.tasksDbId} />
								</label>
								<label>
									Notes database ID
									<input type="text" name="notesDbId" value={data.notionConfig.notesDbId} />
								</label>
							</div>
						</fieldset>

						<fieldset class="notion-group">
							<legend>Task field mapping</legend>
							<div class="settings-grid notion-grid-two">
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
									Carried-over property
									<input
										type="text"
										name="taskCarriedOverProperty"
										value={data.notionConfig.taskFieldMap.carriedOver}
									/>
								</label>
							</div>
						</fieldset>

						<fieldset class="notion-group">
							<legend>Note field mapping</legend>
							<div class="settings-grid notion-grid-two">
								<label>
									Title property
									<input type="text" name="noteTitleProperty" value={data.notionConfig.noteFieldMap.title} />
								</label>
								<label>
									Content property
									<input type="text" name="noteContentProperty" value={data.notionConfig.noteFieldMap.content} />
								</label>
								<label class="notion-span-full">
									Day property
									<input type="text" name="noteDayProperty" value={data.notionConfig.noteFieldMap.day} />
								</label>
							</div>
						</fieldset>

					</form>

					<form method="post" action="?/syncNotion" use:enhance>
						<button class="btn btn-primary" type="submit">Sync now</button>
					</form>
				{/if}
			</section>
		</div>
	</Modal>

	{#if form?.message}
		<Toast message={form.message} tone={getToastTone(form.message)} stamp={form} />
	{/if}
</main>

<style>
	.page-shell {
		width: 100%;
		padding: 0 0 var(--app-space-md);
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--app-space-md);
		height: 100dvh;
		box-sizing: border-box;
		overflow: hidden;
	}

	.top-nav-wrap {
		position: sticky;
		top: 0;
		z-index: 30;
		width: 100vw;
		margin-left: calc(50% - 50vw);
		background: var(--app-clr-surface-card);
		border-bottom: var(--app-border-thick);
	}

	.page-content {
		width: min(1200px, 100%);
		margin: 0 auto;
		padding: 0 var(--app-space-md);
		height: 100%;
		min-height: 0;
	}

	.card {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-lg);
		padding: var(--app-space-md);
		background: var(--app-clr-surface-card);
		box-shadow: var(--app-shadow-medium);
		display: grid;
		gap: var(--app-space-md);
		align-content: start;
		transition: background-color 0.4s ease;
		min-height: 0;
		overflow: auto;
	}

	/* Minimal card scrollbars: transparent track, visible handle only. */
	.card {
		scrollbar-width: thin;
		scrollbar-color: color-mix(in oklab, var(--app-clr-on-surface-text-muted) 45%, transparent)
			transparent;
	}

	.card::-webkit-scrollbar {
		width: 10px;
		height: 10px;
	}

	.card::-webkit-scrollbar-track {
		background: transparent;
	}

	.card::-webkit-scrollbar-thumb {
		background: color-mix(in oklab, var(--app-clr-on-surface-text-muted) 45%, transparent);
		border-radius: 999px;
		border: 2px solid transparent;
		background-clip: padding-box;
	}

	.card::-webkit-scrollbar-corner {
		background: transparent;
	}

	.card[data-elevated='false'] {
		box-shadow: none;
	}

	.top-nav {
		min-height: var(--app-nav-height);
		width: min(1200px, 100%);
		margin: 0 auto;
		padding: var(--app-space-md);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--app-space-md);
	}

	.nav-brand {
		display: grid;
		gap: var(--app-space-xs);
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
		align-items: center;
		gap: var(--app-space-xs);
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
		padding: var(--app-space-sm) var(--app-space-md);
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
		width: 2.5rem;
		height: 2.5rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.icon-btn.active {
		background: var(--app-clr-action-primary);
		color: var(--app-clr-action-primary-text);
		box-shadow: var(--app-shadow-interactive-press);
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
		grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-areas:
			'pomodoro todos'
			'pomodoro dump';
		gap: var(--app-space-md);
		align-items: stretch;
		height: 100%;
		min-height: 0;
	}

	.pomodoro-card {
		grid-area: pomodoro;
		gap: var(--app-space-sm);
	}

	.todos-card {
		grid-area: todos;
	}

	.todos-card > h2 {
		margin-bottom: 0;
	}

	.dump-card {
		grid-area: dump;
	}

	.timers-panel {
		height: 100%;
		min-height: 0;
		align-content: start;
	}

	.timers-summary {
		color: var(--app-clr-on-surface-text-muted);
		font-size: var(--app-text-sm);
	}

	.timers-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: var(--app-space-md);
		align-items: stretch;
		min-height: 0;
	}

	.timers-subcard {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		background: color-mix(in oklab, var(--app-clr-surface-raised) 50%, transparent);
		padding: var(--app-space-md);
		display: grid;
		gap: var(--app-space-sm);
		align-content: start;
	}

	.timers-subcard > h3 {
		margin-bottom: var(--app-space-xs);
	}

	.timers-active-card {
		justify-items: center;
		text-align: center;
	}

	.timers-active-name {
		font-weight: 700;
		color: var(--app-clr-on-surface-text);
	}

	.timers-active-clock {
		font-size: clamp(2.5rem, 8vw, 4rem);
	}

	.timers-active-label {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		padding: var(--app-space-xs) var(--app-space-sm);
		font-size: var(--app-text-sm);
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.timers-active-label-none {
		background: var(--app-clr-surface-card);
		color: var(--app-clr-on-surface-text-secondary);
	}

	.timers-active-label-warning {
		background: color-mix(in oklab, var(--app-clr-break) 24%, var(--app-clr-surface-card));
		color: var(--app-clr-on-surface-text);
	}

	.timers-active-label-critical {
		background: color-mix(in oklab, var(--app-clr-action-critical) 26%, var(--app-clr-surface-card));
		color: var(--app-clr-on-surface-text);
	}

	.timers-active-label-completed {
		background: color-mix(in oklab, var(--app-clr-action-success) 24%, var(--app-clr-surface-card));
		color: var(--app-clr-on-surface-text);
	}

	.timers-notice {
		width: 100%;
		padding: var(--app-space-xs) var(--app-space-sm);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-card);
		color: var(--app-clr-on-surface-text-secondary);
		font-size: var(--app-text-sm);
	}

	.timers-form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: var(--app-space-sm);
	}

	.timers-list-wrap {
		grid-column: 1 / -1;
		min-height: 0;
		border: none;
		border-radius: 0;
		background: transparent;
		padding: 0;
		box-shadow: none;
	}

	.timers-empty {
		color: var(--app-clr-on-surface-text-muted);
	}

	.timers-list {
		gap: var(--app-space-sm);
	}

	.timers-drop-indicator {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: var(--app-space-sm);
		background: color-mix(in oklab, var(--app-clr-focus-ring) 18%, var(--app-clr-surface-card));
		pointer-events: none;
	}

	.timers-drop-line {
		height: 0;
		border-top: 3px solid var(--app-clr-focus-ring);
		border-radius: 999px;
	}

	.timers-item {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: var(--app-space-sm);
		background: var(--app-clr-surface-card);
		display: grid;
		gap: var(--app-space-xs);
		transition:
			transform var(--app-transition-fast),
			box-shadow var(--app-transition-fast),
			opacity var(--app-transition-fast);
	}

	.timers-item-warning {
		background: color-mix(in oklab, var(--app-clr-break) 18%, var(--app-clr-surface-card));
	}

	.timers-item-critical {
		background: color-mix(in oklab, var(--app-clr-action-critical) 18%, var(--app-clr-surface-card));
	}

	.timers-item-completed {
		background: color-mix(in oklab, var(--app-clr-action-success) 20%, var(--app-clr-surface-card));
	}

	.timers-item-head {
		display: flex;
		justify-content: space-between;
		gap: var(--app-space-sm);
		align-items: flex-start;
	}

	.timers-item-name {
		font-weight: 700;
		color: var(--app-clr-on-surface-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.timers-item-clock {
		font-family: var(--app-font-mono);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--app-clr-on-surface-text);
	}

	.timers-item-clock > span {
		font-size: var(--app-text-sm);
		font-weight: 500;
		color: var(--app-clr-on-surface-text-muted);
	}

	.timers-item-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--app-space-sm);
		font-size: var(--app-text-sm);
		color: var(--app-clr-on-surface-text-secondary);
	}

	.timers-item-actions {
		display: inline-flex;
		flex-wrap: wrap;
		gap: var(--app-space-xs);
		justify-content: flex-end;
	}

	.timers-item.is-dragging {
		opacity: 0.65;
		transform: scale(0.99);
	}

	.modal-settings-layout {
		display: grid;
		grid-template-columns: minmax(10rem, 12rem) minmax(0, 1fr);
		gap: var(--app-space-md);
		align-items: start;
	}

	.settings-tabs {
		display: grid;
		gap: var(--app-space-xs);
	}

	.settings-tab {
		font: inherit;
		font-weight: 600;
		text-align: left;
		padding: var(--app-space-sm) var(--app-space-md);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text-secondary);
		cursor: pointer;
		box-shadow: var(--app-shadow-small);
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			color var(--app-transition-fast),
			background-color var(--app-transition-fast);
	}

	.settings-tab.active {
		color: var(--app-clr-on-surface-text);
		background: var(--app-clr-surface-card);
		box-shadow: var(--app-shadow-interactive-press);
	}

	.settings-tab:hover:not(.active) {
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.settings-tab:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.settings-panel {
		min-height: 0;
	}

	.start-day-prompt {
		display: grid;
		gap: var(--app-space-sm);
	}

	.start-day-prompt p {
		color: var(--app-clr-on-surface-text-secondary);
	}

	.start-day-actions {
		align-items: center;
	}

	.start-day-actions-cta {
		margin-left: auto;
	}

	h1,
	h2,
	h3 {
		margin: 0;
		line-height: var(--app-leading-tight);
	}

	h1 {
		font-size: calc(var(--app-text-xl) * 1.5);
		letter-spacing: -0.01em;
	}

	h2 {
		font-size: calc(var(--app-text-lg) * 1.5);
	}

	h3 {
		font-size: calc(var(--app-text-base) * 1.5);
		color: var(--app-clr-on-surface-text-secondary);
	}

	.card > h2,
	.card > h3,
	.card > .section-heading {
		margin-bottom: var(--app-space-xs);
	}

	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--app-space-sm);
		flex-wrap: wrap;
	}

	p {
		margin: 0;
	}

	.mode-toggle-wrap {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--app-space-xs);
	}

	.mode-btn {
		font: inherit;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		line-height: 1;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		padding: var(--app-space-xs) var(--app-space-sm);
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

	/* Keep only primary buttons and selects aligned. */
	.btn,
	select {
		height: var(--app-control-height-base);
	}

	/* Pomodoro mode tabs are intentionally smaller than primary controls. */
	.mode-btn {
		height: var(--app-control-height-pomodoro-tab);
	}

	/* Timer shortcut chips are the smallest action controls. */
	.chip {
		height: var(--app-control-height-chip);
	}

	.btn,
	.mode-btn,
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
		text-align: center;
		justify-self: center;
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

	.timer-actions {
		flex-wrap: nowrap;
	}

	.timer-actions > .btn {
		flex: 1 1 0;
		min-width: 0;
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
		padding: var(--app-space-sm);
		background: var(--app-clr-surface-input);
		color: var(--app-clr-on-surface-text);
	}

	.dump-card textarea {
		resize: vertical;
	}

	select {
		-webkit-appearance: none;
		appearance: none;
		padding-top: 0;
		padding-bottom: 0;
		line-height: 1.2;
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
		padding: var(--app-space-sm) var(--app-space-md);
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

	.notion-settings-form {
		gap: var(--app-space-md);
	}

	.notion-group {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: var(--app-space-sm);
		display: grid;
		gap: var(--app-space-sm);
		background: color-mix(in oklab, var(--app-clr-surface-raised) 55%, transparent);
	}

	.notion-group legend {
		padding: 0 var(--app-space-xs);
		font-weight: 700;
		color: var(--app-clr-on-surface-text);
	}

	.notion-help {
		font-size: var(--app-text-sm);
		color: var(--app-clr-on-surface-text-muted);
	}

	.notion-grid-two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.notion-span-full {
		grid-column: 1 / -1;
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
		padding: var(--app-space-xs) var(--app-space-sm);
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
		gap: var(--app-space-xs);
	}

	.schedule-item {
		display: flex;
		justify-content: space-between;
		padding: var(--app-space-xs) var(--app-space-sm);
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
		gap: var(--app-space-md);
	}

	.list-item {
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		padding: var(--app-space-sm);
		display: grid;
		gap: var(--app-space-md);
		background: color-mix(in oklab, var(--app-clr-surface-raised) 62%, transparent);
	}

	.todo-add-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--app-space-sm);
		align-items: center;
	}

	.todo-list {
		gap: var(--app-space-sm);
	}

	.task-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--app-space-sm);
		padding: 0;
	}

	.task-row form {
		margin: 0;
	}

	.task-row-actions {
		display: inline-flex;
		gap: var(--app-space-xs);
		justify-self: end;
	}

	.task-title-form {
		min-width: 0;
	}

	.todo-add-row input,
	.task-title-form input {
		height: var(--app-control-height-base);
		padding-top: 0;
		padding-bottom: 0;
	}

	.task-title-form input.done {
		color: var(--app-clr-on-surface-text-muted);
		text-decoration: line-through;
	}

	.task-icon-btn {
		width: var(--app-control-height-base);
		height: var(--app-control-height-base);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-small);
		cursor: pointer;
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast),
			background-color var(--app-transition-fast);
	}

	.task-icon-btn:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.task-icon-btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.task-icon-btn-primary {
		background: var(--app-clr-action-primary);
		color: var(--app-clr-action-primary-text);
	}

	.task-icon-btn-success {
		background: var(--app-clr-action-success);
		color: var(--app-clr-action-success-text);
	}

	.task-icon-btn-critical {
		background: var(--app-clr-action-critical);
		color: var(--app-clr-action-critical-text);
	}

	.todo-carry-row {
		margin-top: auto;
		justify-items: end;
	}

	@media (max-width: 980px) {
		.my-day-grid {
			grid-template-columns: 1fr;
			grid-template-rows: repeat(3, minmax(0, 1fr));
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

		.modal-settings-layout {
			grid-template-columns: 1fr;
		}

		.notion-grid-two {
			grid-template-columns: 1fr;
		}

		.timers-grid {
			grid-template-columns: 1fr;
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
