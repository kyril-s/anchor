<script lang="ts">
	type Tone = 'success' | 'warning' | 'error';

	type Props = {
		message?: string;
		tone?: Tone;
		stamp?: unknown;
		durationMs?: number;
		onDismiss?: () => void;
	};

	let { message = '', tone = 'success', stamp, durationMs = 4000, onDismiss = () => {} }: Props = $props();
	let visible = $state(false);
	let hideHandle: ReturnType<typeof setTimeout> | null = null;

	function clearHideHandle() {
		if (!hideHandle) return;
		clearTimeout(hideHandle);
		hideHandle = null;
	}

	$effect(() => {
		// `stamp` lets parent retrigger this effect for identical message text.
		void stamp;
		clearHideHandle();
		if (!message) {
			visible = false;
			return;
		}

		visible = true;
		hideHandle = setTimeout(() => {
			visible = false;
			hideHandle = null;
			onDismiss();
		}, durationMs);

		return () => clearHideHandle();
	});
</script>

{#if visible && message}
	<div class="toast-wrap" aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true">
		<div class="toast" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
			<p>{message}</p>
		</div>
	</div>
{/if}

<style>
	.toast-wrap {
		position: fixed;
		left: 50%;
		bottom: var(--app-space-lg);
		transform: translateX(-50%);
		z-index: 60;
		pointer-events: none;
		width: min(36rem, calc(100vw - (2 * var(--app-space-md))));
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: var(--app-space-sm);
		padding: var(--app-space-sm) var(--app-space-md);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-md);
		box-shadow: var(--app-shadow-large);
		font-size: var(--app-text-sm);
	}

	.toast[data-tone='success'] {
		background: var(--app-clr-state-success-dim, #dcfce7);
		color: var(--app-clr-state-success, #15803d);
	}

	.toast[data-tone='warning'] {
		background: var(--app-clr-state-warning-dim, #ffedd5);
		color: var(--app-clr-state-warning, #b45309);
	}

	.toast[data-tone='error'] {
		background: var(--app-clr-state-critical-dim, #fee2e2);
		color: var(--app-clr-state-critical, #b91c1c);
	}

	.toast p {
		margin: 0;
		font-weight: 700;
	}
</style>
