<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submitting = $state(false);
  let errorElement = $state<HTMLElement>();
  let email = $state(untrack(() => form?.email ?? ''));

  const enhanceSignIn: SubmitFunction = () => {
    submitting = true;

    return async ({ update }) => {
      await update();
      submitting = false;
    };
  };

  $effect(() => {
    if (form?.error && errorElement) {
      void tick().then(() => errorElement?.focus());
    }
  });
</script>

<svelte:head>
  <title>{data.copy['moderation.signInTitle']} | {data.copy['site.name']}</title>
</svelte:head>

<main class="sign-in-shell">
  <section class="sign-in-card" aria-labelledby="sign-in-title">
    <div class="identity-mark" aria-hidden="true">H</div>
    <p class="eyebrow">{data.copy['nav.moderation']}</p>
    <h1 id="sign-in-title">{data.copy['moderation.signInTitle']}</h1>
    <p class="intro">{data.copy['moderation.signInIntro']}</p>

    {#if form?.error}
      <p class="message error" role="alert" tabindex="-1" bind:this={errorElement}>
        {form.error}
      </p>
    {/if}

    {#if form?.success}
      <p class="message success" role="status">
        {data.copy['moderation.linkSent']}
      </p>
    {/if}

    <form method="POST" use:enhance={enhanceSignIn} aria-busy={submitting}>
      <label for="moderator-email">{data.copy['moderation.emailLabel']}</label>
      <input
        id="moderator-email"
        name="email"
        type="email"
        autocomplete="email"
        inputmode="email"
        required
        bind:value={email}
        aria-describedby="sign-in-privacy"
      />
      <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
      <button type="submit" disabled={submitting}>
        {submitting ? data.copy['moderation.sendingLink'] : data.copy['moderation.sendLink']}
      </button>
    </form>

    <p id="sign-in-privacy" class="privacy">
      {data.copy['moderation.signInPrivacy']}
    </p>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #f7f0df;
    color: #193b45;
    font-family: var(--font-sans);
  }

  .sign-in-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    box-sizing: border-box;
    background:
      radial-gradient(circle at 18% 18%, rgb(235 112 72 / 20%) 0 8rem, transparent 8.2rem),
      radial-gradient(circle at 85% 82%, rgb(52 132 144 / 18%) 0 10rem, transparent 10.2rem),
      #f7f0df;
  }

  .sign-in-card {
    width: min(100%, 30rem);
    box-sizing: border-box;
    padding: clamp(1.5rem, 5vw, 3rem);
    border: 2px solid #193b45;
    border-radius: 2rem 0.8rem 2rem 0.8rem;
    background: #fffaf0;
    box-shadow: 0.8rem 0.8rem 0 #f1a33b;
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

  .eyebrow {
    margin: 1.25rem 0 0.35rem;
    color: #b5402b;
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 8vw, 3.4rem);
    line-height: 0.98;
    letter-spacing: -0.045em;
  }

  .intro {
    max-width: 34ch;
    margin: 1rem 0 1.5rem;
    line-height: 1.55;
  }

  form {
    display: grid;
    gap: 0.65rem;
  }

  label {
    font-weight: 800;
  }

  input[type='email'] {
    min-height: 3.25rem;
    box-sizing: border-box;
    padding: 0.75rem 1rem;
    border: 2px solid #193b45;
    border-radius: 0.7rem;
    background: white;
    color: inherit;
    font: inherit;
  }

  input[type='email']:focus-visible,
  button:focus-visible,
  .message:focus-visible {
    outline: 4px solid #f1a33b;
    outline-offset: 3px;
  }

  button {
    min-height: 3.25rem;
    margin-top: 0.4rem;
    border: 2px solid #193b45;
    border-radius: 999px;
    background: #2f818d;
    color: white;
    font: inherit;
    font-weight: 850;
    cursor: pointer;
    box-shadow: 0 0.3rem 0 #193b45;
  }

  button:active:not(:disabled) {
    transform: translateY(0.2rem);
    box-shadow: 0 0.1rem 0 #193b45;
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
    border: 2px solid #9e3025;
    background: #ffe1d7;
    color: #78231c;
  }

  .success {
    border: 2px solid #28715e;
    background: #dff3e4;
    color: #195546;
  }

  .privacy {
    margin: 1rem 0 0;
    color: #536b70;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  @media (prefers-reduced-motion: no-preference) {
    button {
      transition:
        transform 120ms ease,
        box-shadow 120ms ease;
    }
  }
</style>
