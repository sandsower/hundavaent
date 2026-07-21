<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let errorElement = $state<HTMLElement>();

  const enhanceSignIn: SubmitFunction = () => {
    submitting = true;
    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  $effect(() => {
    if (form?.incorrect && errorElement) void tick().then(() => errorElement?.focus());
  });
</script>

<svelte:head>
  <title>Translations | Hundavænt</title>
</svelte:head>

<main class="sign-in-shell" data-ui-mode="operations" data-translation-workspace-sign-in>
  <section class="sign-in-card hv-panel" aria-labelledby="translation-sign-in-title">
    <div class="identity-mark" aria-hidden="true">H</div>
    <p class="hv-eyebrow">Private workspace</p>
    <h1 id="translation-sign-in-title">Translations</h1>
    <p class="intro">Enter the shared password to edit Icelandic and English interface copy.</p>

    {#if form?.incorrect}
      <p class="hv-notice" data-tone="error" role="alert" tabindex="-1" bind:this={errorElement}>
        That password is not correct.
      </p>
    {/if}

    <form method="POST" use:enhance={enhanceSignIn} aria-busy={submitting}>
      <label for="translation-password">Shared password</label>
      <input
        id="translation-password"
        class="hv-field"
        name="password"
        type="password"
        autocomplete="current-password"
        required
      />
      <input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />
      <button class="hv-control" data-intent="primary" type="submit" disabled={submitting}>
        {submitting ? 'Opening…' : 'Open workspace'}
      </button>
    </form>
  </section>
</main>

<style>
  .sign-in-shell {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--hv-color-snow);
  }

  .sign-in-card {
    width: min(100%, 28rem);
    padding: clamp(1.5rem, 6vw, 2.75rem);
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
    font-size: 1.5rem;
    font-weight: 700;
  }

  h1 {
    margin: 0.3rem 0 0;
    font-family: var(--hv-font-display);
    font-size: clamp(2.4rem, 10vw, 3.6rem);
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.035em;
  }

  .hv-eyebrow {
    margin: 1.2rem 0 0;
  }

  .intro {
    margin: 0.8rem 0 1.4rem;
    color: var(--hv-color-basalt-muted);
    line-height: 1.5;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  label {
    font-weight: 850;
  }

  input,
  button {
    min-height: 3.1rem;
  }
</style>
