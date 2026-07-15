<script lang="ts">
  import '../../app.css';

  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let errorElement = $state<HTMLElement>();

  const enhanceGate: SubmitFunction = () => {
    submitting = true;

    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  $effect(() => {
    if (form?.incorrect && errorElement) {
      void tick().then(() => errorElement?.focus());
    }
  });
</script>

<svelte:head>
  <title>Hundavænt</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="gate-shell" data-ui-mode="place">
  <section class="gate-card" aria-labelledby="gate-title">
    <div class="identity-mark" aria-hidden="true">H</div>
    <h1 id="gate-title">Hundavænt</h1>
    <p class="intro">Í smíðum</p>

    {#if form?.incorrect}
      <p class="message error" role="alert" tabindex="-1" bind:this={errorElement}>
        Rangt lykilorð
      </p>
    {/if}

    <form method="POST" use:enhance={enhanceGate} aria-busy={submitting}>
      <label for="gate-password">Lykilorð</label>
      <input
        id="gate-password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
      />
      <input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />
      <button type="submit" disabled={submitting}>Opna</button>
    </form>
  </section>
</main>

<style>
  .gate-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    background: var(--hv-color-snow);
  }

  .gate-card {
    width: min(100%, 26rem);
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    box-shadow: var(--hv-shadow-raised);
  }

  .identity-mark {
    width: 3.25rem;
    height: 3.25rem;
    display: grid;
    place-items: center;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    font-family: var(--hv-font-display);
    font-size: 1.45rem;
    font-weight: 650;
  }

  h1 {
    margin: 1.25rem 0 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 8vw, 3rem);
    font-weight: 650;
    line-height: 0.98;
    letter-spacing: -0.035em;
  }

  .intro {
    margin: 0.5rem 0 1.5rem;
    color: var(--hv-color-basalt-muted);
    font-weight: 700;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  label {
    font-weight: 800;
  }

  input[type='password'] {
    min-height: var(--hv-control-height);
    padding: 0.75rem 1rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-snow-raised);
    color: inherit;
    font: inherit;
  }

  input[type='password']:focus-visible,
  button:focus-visible,
  .message:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  button {
    min-height: var(--hv-control-height);
    margin-top: 0.4rem;
    border: 1px solid var(--hv-color-basalt);
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    color: var(--hv-color-snow-raised);
    font: inherit;
    font-weight: 850;
    cursor: pointer;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .message {
    padding: 0.8rem 1rem;
    border-radius: var(--hv-radius-control);
    font-weight: 700;
  }

  .error {
    border: 1px solid var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }
</style>
