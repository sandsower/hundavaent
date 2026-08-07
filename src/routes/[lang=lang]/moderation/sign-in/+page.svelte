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

<main
  class="sign-in-shell grid place-items-center min-h-[calc(100dvh_-_var(--hv-app-header-height,4.4rem))] box-border py-8 px-4 bg-snow"
  data-ui-mode="operations"
>
  <section
    class="sign-in-card w-[min(100%,30rem)] box-border p-[clamp(1.5rem,5vw,2.5rem)] border border-border-subtle rounded-shell bg-snow-raised shadow-raised"
    aria-labelledby="sign-in-title"
  >
    <div
      class="identity-mark grid place-items-center size-13 rounded-control bg-basalt text-[1.45rem] font-black text-snow-raised"
      aria-hidden="true"
    >
      H
    </div>
    <p
      class="eyebrow m-[1.25rem_0_0.35rem] text-[0.8rem] font-extrabold tracking-[0.12em] uppercase text-fjord"
    >
      {data.copy['nav.moderation']}
    </p>
    <h1
      id="sign-in-title"
      class="m-0 font-display text-[clamp(2rem,8vw,3rem)] font-[650] leading-none tracking-[-0.035em] text-basalt"
    >
      {data.copy['moderation.signInTitle']}
    </h1>
    <p class="intro max-w-[34ch] m-[1rem_0_1.5rem] leading-[1.55]">
      {data.copy['moderation.signInIntro']}
    </p>

    {#if form?.error}
      <p
        class="message error py-[0.8rem] px-4 border border-danger rounded-panel bg-danger-soft font-bold text-danger focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        role="alert"
        tabindex="-1"
        bind:this={errorElement}
      >
        {form.error}
      </p>
    {/if}

    {#if form?.success}
      <p
        class="message success py-[0.8rem] px-4 border border-success rounded-panel bg-success-soft font-bold text-success focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        role="status"
      >
        {data.copy['moderation.linkSent']}
      </p>
    {/if}

    <form
      class="grid gap-[0.65rem]"
      method="POST"
      use:enhance={enhanceSignIn}
      aria-busy={submitting}
    >
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

    <p
      id="sign-in-privacy"
      class="privacy m-[1rem_0_0] text-[0.88rem] leading-[1.45] text-basalt-muted"
    >
      {data.copy['moderation.signInPrivacy']}
    </p>
  </section>
</main>

<style>
  /* Field renders its own <label>, crossing this component's scoping boundary; :global() reaches
     it purely on the literal element. Weight 800 is the one thing not approved to change in this
     migration. */
  form :global(label) {
    font-weight: 800;
  }
</style>
