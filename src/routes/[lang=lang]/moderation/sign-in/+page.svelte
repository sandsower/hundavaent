<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick, untrack } from 'svelte';

  import { Button, Field, Input } from '@hundavaent/design-system';
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

<main class="sign-in-shell" data-ui-mode="operations">
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
      <Field label={data.copy['moderation.emailLabel']}>
        <Input
          name="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          required
          bind:value={email}
          aria-describedby="sign-in-privacy"
        />
      </Field>
      <input type="hidden" name="returnTo" value={form?.returnTo ?? data.returnTo} />
      <Button intent="primary" type="submit" class="mt-[0.4rem]" disabled={submitting}>
        {submitting ? data.copy['moderation.sendingLink'] : data.copy['moderation.sendLink']}
      </Button>
    </form>

    <p id="sign-in-privacy" class="privacy">
      {data.copy['moderation.signInPrivacy']}
    </p>
  </section>
</main>

<style>
  .sign-in-shell {
    min-height: calc(100dvh - var(--hv-app-header-height, 4.4rem));
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
    box-sizing: border-box;
    background: var(--hv-color-snow);
  }

  .sign-in-card {
    width: min(100%, 30rem);
    box-sizing: border-box;
    padding: clamp(1.5rem, 5vw, 2.5rem);
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-shell);
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
    font-size: 1.45rem;
    font-weight: 900;
  }

  .eyebrow {
    margin: 1.25rem 0 0.35rem;
    color: var(--hv-color-fjord);
    font-size: 0.8rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: var(--hv-color-basalt);
    font-family: var(--hv-font-display);
    font-size: clamp(2rem, 8vw, 3rem);
    font-weight: 650;
    line-height: 1;
    letter-spacing: -0.035em;
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

  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element. Weight 800 is the one thing not approved to change in this
     migration. */
  form :global(label) {
    font-weight: 800;
  }

  .message:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }

  .message {
    padding: 0.8rem 1rem;
    border: 1px solid;
    border-radius: var(--hv-radius-panel);
    font-weight: 700;
  }

  .error {
    border-color: var(--hv-color-danger);
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
  }

  .success {
    border-color: var(--hv-color-success);
    background: var(--hv-color-success-soft);
    color: var(--hv-color-success);
  }

  .privacy {
    margin: 1rem 0 0;
    color: var(--hv-color-basalt-muted);
    font-size: 0.88rem;
    line-height: 1.45;
  }
</style>
