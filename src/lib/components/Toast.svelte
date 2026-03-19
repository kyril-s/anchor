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
		background: var(--color-status-success-subtle);
		color: var(--color-status-success);
	}

	.toast[data-tone='warning'] {
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning);
	}

	.toast[data-tone='error'] {
		background: var(--color-status-critical-subtle);
		color: var(--color-status-critical);
	}

	.toast p {
		margin: 0;
		font-weight: 700;
	}
</style>
