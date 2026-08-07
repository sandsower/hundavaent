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

<main
  class="sign-in-shell grid place-items-center min-h-dvh p-4 bg-snow"
  data-ui-mode="operations"
  data-translation-workspace-sign-in
>
  <!-- .sign-in-card now lives on Panel's root element, outside this file's scope hash. The class
       name is NOT unique repo-wide (moderation/sign-in/+page.svelte also has a `.sign-in-card`),
       so a bare :global(.sign-in-card) would leak across files. Anchoring off .sign-in-shell (a
       plain, locally-authored <main> that keeps this file's own scope hash) keeps the rule scoped
       to this page only. -->
  <Panel
    as="section"
    class="sign-in-card w-[min(100%,28rem)] p-[clamp(1.5rem,6vw,2.75rem)]"
    aria-labelledby="translation-sign-in-title"
  >
    <div
      class="identity-mark grid place-items-center w-13 h-13 rounded-control bg-basalt font-display text-[1.5rem] font-bold text-snow-raised"
      aria-hidden="true"
    >
      H
    </div>
    <!-- Eyebrow's own base classes carry m-0; the route's later mt utility restores the intended
         separation from the identity mark while retaining the semantic tight-eyebrow hook. -->
    <Eyebrow class="tight-eyebrow mt-[1.2rem]">Private workspace</Eyebrow>
    <h1
      class="mt-[0.3rem] mx-0 mb-0 font-display text-[clamp(2.4rem,10vw,3.6rem)] font-[650] leading-none tracking-[-0.035em]"
      id="translation-sign-in-title"
    >
      Translations
    </h1>
    <p class="intro mt-[0.8rem] mx-0 mb-[1.4rem] leading-[1.5] text-basalt-muted">
      Enter the shared password to edit Icelandic and English interface copy.
    </p>

    <!-- Native <p> carrying Notice's exact error recipe rather than the Notice component: the
         focus-after-submit effect needs bind:this on the DOM node, which a component boundary
         cannot forward (the moderation places/new error message documents the same trade). -->
    {#if form?.throttled}
      <p
        class="border rounded-panel p-panel border-danger bg-danger-soft text-danger"
        role="alert"
        tabindex="-1"
        bind:this={errorElement}
      >
        Too many failed attempts. Try again in about {Math.ceil(form.retryAfterSeconds / 60)} minutes.
      </p>
    {:else if form?.incorrect}
      <p
        class="border rounded-panel p-panel border-danger bg-danger-soft text-danger"
        role="alert"
        tabindex="-1"
        bind:this={errorElement}
      >
        That password is not correct.
      </p>
    {/if}

    <form
      class="grid gap-[0.65rem]"
      method="POST"
      use:enhance={enhanceSignIn}
      aria-busy={submitting}
    >
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
  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element. Weight 850 is the one thing not approved to change in this
     migration. */
  form :global(label) {
    font-weight: 850;
  }
</style>
