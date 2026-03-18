<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	type AuthFlow = 'register' | 'login';
	let activeFlow = $state<AuthFlow>('login');
</script>

<main class="auth-page">
	<section class="auth-card">
		<h1>Welcome to Anchor</h1>

		<div class="auth-tabs" role="tablist" aria-label="Authentication flows">
			<button
				type="button"
				role="tab"
				class="tab-btn tab-btn-login"
				class:active={activeFlow === 'login'}
				aria-selected={activeFlow === 'login'}
				onclick={() => (activeFlow = 'login')}
			>
				Log in
			</button>
			<button
				type="button"
				role="tab"
				class="tab-btn tab-btn-register"
				class:active={activeFlow === 'register'}
				aria-selected={activeFlow === 'register'}
				onclick={() => (activeFlow = 'register')}
			>
				Register
			</button>
		</div>

		<section class="flow-section" role="tabpanel">
			{#if activeFlow === 'register'}
				<form method="post" action="/login?/signUpEmail" use:enhance>
					<label>
						Name
						<input type="text" name="name" required />
					</label>

					<label>
						Email
						<input type="email" name="email" required />
					</label>

					<label>
						Password
						<input type="password" name="password" required />
					</label>

					<div class="actions">
						<button type="submit" class="btn btn-primary">Register</button>
					</div>
				</form>
			{:else}
				<form method="post" action="/login?/signInEmail" use:enhance>
					<label>
						Email
						<input type="email" name="email" required />
					</label>

					<label>
						Password
						<input type="password" name="password" required />
					</label>

					<div class="actions">
						<button type="submit" class="btn btn-primary">Log in</button>
					</div>
				</form>
			{/if}
		</section>

		{#if form?.message}
			<p class="error">{form.message}</p>
		{/if}
	</section>
</main>

<style>
	.auth-page {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: var(--app-space-lg);
	}

	.auth-card {
		width: min(480px, 100%);
		padding: var(--app-space-lg);
		border-radius: var(--app-radius-lg);
		border: var(--app-border-thick);
		background: var(--app-clr-surface-card);
		box-shadow: var(--app-shadow-medium);
	}

	form {
		display: grid;
		gap: var(--app-space-sm);
	}

	.auth-tabs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--app-space-xs);
		margin-bottom: var(--app-space-md);
	}

	.tab-btn {
		font: inherit;
		padding: var(--app-space-sm) var(--app-space-md);
		font-size: var(--app-text-sm);
		font-weight: 700;
		letter-spacing: 0.02em;
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

	.tab-btn.active {
		color: #ffffff;
		box-shadow: var(--app-shadow-interactive-press);
	}

	.tab-btn-register.active {
		background: var(--app-clr-work);
	}

	.tab-btn-login.active {
		background: var(--app-clr-break);
	}

	.tab-btn:hover:not(.active) {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
		color: var(--app-clr-on-surface-text);
	}

	.tab-btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.flow-section {
		padding-top: var(--app-space-xs);
	}

	label {
		display: grid;
		gap: var(--app-space-xs);
		font-size: var(--app-text-sm);
		color: var(--app-clr-on-surface-text-secondary);
	}

	input {
		width: 100%;
		min-height: var(--app-control-height-base);
		padding: 0 var(--app-space-sm);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-input);
		color: var(--app-clr-on-surface-text);
		font: inherit;
	}

	.actions {
		display: flex;
		gap: var(--app-space-sm);
		margin-top: var(--app-space-xs);
	}

	.btn {
		font: inherit;
		padding: var(--app-space-sm) var(--app-space-md);
		border: var(--app-border-thick);
		border-radius: var(--app-radius-sm);
		background: var(--app-clr-surface-raised);
		color: var(--app-clr-on-surface-text);
		box-shadow: var(--app-shadow-small);
		cursor: pointer;
		transition:
			box-shadow var(--app-transition-fast),
			transform var(--app-transition-fast);
	}

	.btn:hover {
		box-shadow: var(--app-shadow-interactive-hover);
		transform: translate(-1px, -1px);
	}

	.btn:active {
		box-shadow: var(--app-shadow-interactive-press);
		transform: translate(1px, 1px);
	}

	.btn-primary {
		background: var(--app-clr-action-primary);
		color: var(--app-clr-action-primary-text);
	}

	.error {
		color: var(--app-clr-error);
		margin-top: var(--app-space-sm);
		font-size: var(--app-text-sm);
	}

	@media (max-width: 560px) {
		.auth-tabs {
			grid-template-columns: 1fr;
		}
	}
</style>
