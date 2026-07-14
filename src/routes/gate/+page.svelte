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

<main class="gate-shell">
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
  :global(body) {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
  }

  .gate-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    box-sizing: border-box;
    background:
      radial-gradient(circle at 18% 18%, rgb(235 112 72 / 20%) 0 8rem, transparent 8.2rem),
      radial-gradient(circle at 85% 82%, rgb(52 132 144 / 18%) 0 10rem, transparent 10.2rem),
      var(--paper);
  }

  .gate-card {
    width: min(100%, 26rem);
    box-sizing: border-box;
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 2px solid var(--ink);
    border-radius: 2rem 0.8rem 2rem 0.8rem;
    background: var(--paper-light);
    box-shadow: 0.8rem 0.8rem 0 var(--amber);
  }

  .identity-mark {
    width: 3.25rem;
    height: 3.25rem;
    display: grid;
    place-items: center;
    border-radius: 50% 45% 52% 42%;
    background: #e86743;
    color: white;
    font-size: 1.45rem;
    font-weight: 900;
    transform: rotate(-5deg);
  }

  h1 {
    margin: 1.25rem 0 0;
    font-size: clamp(2rem, 8vw, 3rem);
    line-height: 0.98;
    letter-spacing: -0.045em;
  }

  .intro {
    margin: 0.5rem 0 1.5rem;
    color: var(--ink-soft);
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
    min-height: 3.25rem;
    box-sizing: border-box;
    padding: 0.75rem 1rem;
    border: 2px solid var(--ink);
    border-radius: 0.7rem;
    background: white;
    color: inherit;
    font: inherit;
  }

  input[type='password']:focus-visible,
  button:focus-visible,
  .message:focus-visible {
    outline: 4px solid var(--amber);
    outline-offset: 3px;
  }

  button {
    min-height: 3.25rem;
    margin-top: 0.4rem;
    border: 2px solid var(--ink);
    border-radius: 999px;
    background: var(--teal);
    color: white;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 0.3rem 0 var(--ink);
  }

  button:active:not(:disabled) {
    transform: translateY(0.2rem);
    box-shadow: 0 0.1rem 0 var(--ink);
  }

  button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .message {
    padding: 0.8rem 1rem;
    border-radius: 0.75rem;
    font-weight: 700;
  }

  .error {
    border: 2px solid var(--danger);
    background: #ffe1d7;
    color: #78231c;
  }

  @media (prefers-reduced-motion: no-preference) {
    button {
      transition:
        transform 120ms ease,
        box-shadow 120ms ease;
    }
  }
</style>
