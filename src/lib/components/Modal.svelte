<script lang="ts">
	type Props = {
		open: boolean;
		title?: string;
		compact?: boolean;
		onClose: () => void;
		children?: import('svelte').Snippet;
	};

	let { open, title = 'Settings', compact = false, onClose, children }: Props = $props();

	function onBackdropClick(event: MouseEvent) {
		// Close only when clicking outside the dialog panel.
		if (event.target === event.currentTarget) onClose();
	}

	function onBackdropKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') onClose();
	}

	function onWindowKeydown(event: KeyboardEvent) {
		if (!open) return;
		if (event.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div
		class="modal-backdrop"
		onclick={onBackdropClick}
		onkeydown={onBackdropKeydown}
		role="presentation"
		tabindex="-1"
	>
		<div
			class="modal-panel"
			class:compact={compact}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			onclick={(event) => event.stopPropagation()}
			onkeydown={onBackdropKeydown}
		>
			<header class="modal-header">
				<h2>{title}</h2>
				<button class="modal-close" type="button" aria-label="Close settings" onclick={onClose}>
					<span aria-hidden="true">x</span>
				</button>
			</header>
			<div class="modal-body">
				{@render children?.()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		display: grid;
		place-items: center;
		padding: 1rem;
		z-index: 50;
	}

	.modal-panel {
		width: min(70vw, 1000px);
		height: 80vh;
		max-width: 1000px;
		background: var(--app-clr-surface-card);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-lg);
		box-shadow: var(--app-shadow-large);
		display: grid;
		grid-template-rows: auto 1fr;
		overflow: hidden;
	}

	.modal-panel.compact {
		width: min(32rem, calc(100vw - 2rem));
		height: auto;
		max-height: min(80vh, calc(100vh - 2rem));
		grid-template-rows: auto minmax(0, 1fr);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.9rem 1rem;
		border-bottom: var(--app-border-thick);
	}

	.modal-header h2 {
		margin: 0;
		font-size: var(--app-text-lg);
	}

	.modal-close {
		font: inherit;
		width: 2rem;
		height: 2rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-small);
		cursor: pointer;
	}

	.modal-close:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.modal-close:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.modal-body {
		padding: 1rem;
		overflow: auto;
	}

	@media (max-width: 900px) {
		.modal-panel {
			width: min(96vw, 1000px);
			height: 85vh;
		}
	}
</style>
