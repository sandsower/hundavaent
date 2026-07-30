<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import { Button, Eyebrow, Field, Input, Panel } from '@hundavaent/design-system';
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
    if ((form?.incorrect || form?.throttled) && errorElement) {
      void tick().then(() => errorElement?.focus());
    }
  });
</script>

<svelte:head>
  <title>Translations | Hundavænt</title>
</svelte:head>

<main class="sign-in-shell" data-ui-mode="operations" data-translation-workspace-sign-in>
  <Panel as="section" class="sign-in-card" aria-labelledby="translation-sign-in-title">
    <div class="identity-mark" aria-hidden="true">H</div>
    <Eyebrow class="tight-eyebrow">Private workspace</Eyebrow>
    <h1 id="translation-sign-in-title">Translations</h1>
    <p class="intro">Enter the shared password to edit Icelandic and English interface copy.</p>

    {#if form?.throttled}
      <p class="hv-notice" data-tone="error" role="alert" tabindex="-1" bind:this={errorElement}>
        Too many failed attempts. Try again in about {Math.ceil(form.retryAfterSeconds / 60)} minutes.
      </p>
    {:else if form?.incorrect}
      <p class="hv-notice" data-tone="error" role="alert" tabindex="-1" bind:this={errorElement}>
        That password is not correct.
      </p>
    {/if}

    <form method="POST" use:enhance={enhanceSignIn} aria-busy={submitting}>
      <Field label="Shared password">
        <Input name="password" type="password" autocomplete="current-password" required />
      </Field>
      <input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />
      <Button intent="primary" type="submit" disabled={submitting || form?.throttled}>
        {submitting ? 'Opening…' : 'Open workspace'}
      </Button>
    </form>
  </Panel>
</main>

<style>
  .sign-in-shell {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 1rem;
    background: var(--hv-color-snow);
  }

  /* .sign-in-card now lives on Panel's root element, outside this file's scope hash. The class
     name is NOT unique repo-wide (moderation/sign-in/+page.svelte also has a `.sign-in-card`),
     so a bare :global(.sign-in-card) would leak across files. Anchoring off .sign-in-shell (a
     plain, locally-authored <main> that keeps this file's own scope hash) keeps the rule scoped
     to this page only. */
  .sign-in-shell :global(.sign-in-card) {
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

  /* Same re-anchor reasoning as .sign-in-card above: Eyebrow's own base classes carry m-0, and
     this override (unlayered scoped CSS) still wins over that layered utility. */
  .sign-in-shell :global(.tight-eyebrow) {
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

  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element. Weight 850 is the one thing not approved to change in this
     migration. */
  form :global(label) {
    font-weight: 850;
  }
</style>
