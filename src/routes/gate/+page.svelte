<script lang="ts">
  import '../../app.css';

  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { tick } from 'svelte';

  import { Button, Field, Input } from '@hundavaent/design-system';
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

<main
  class="gate-shell grid place-items-center min-h-screen py-8 px-4 bg-snow"
  data-ui-mode="place"
>
  <section
    class="gate-card w-[min(100%,26rem)] p-[clamp(1.5rem,5vw,3rem)] border border-border-subtle rounded-panel bg-snow-raised shadow-raised"
    aria-labelledby="gate-title"
  >
    <div
      class="identity-mark grid place-items-center size-13 rounded-control bg-basalt font-display text-[1.45rem] font-[650] text-snow-raised"
      aria-hidden="true"
    >
      H
    </div>
    <h1
      id="gate-title"
      class="mt-5 mx-0 mb-0 font-display text-[clamp(2rem,8vw,3rem)] font-[650] leading-[0.98] tracking-[-0.035em] text-basalt"
    >
      Hundavænt
    </h1>
    <p class="intro mt-2 mx-0 mb-6 font-bold text-basalt-muted">Í smíðum</p>

    {#if form?.incorrect}
      <p
        class="message error py-[0.8rem] px-4 border border-danger rounded-control bg-danger-soft font-bold text-danger focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px] focus-visible:shadow-[0_0_0_2px_var(--hv-focus-offset)]"
        role="alert"
        tabindex="-1"
        bind:this={errorElement}
      >
        Rangt lykilorð
      </p>
    {/if}

    <form class="grid gap-[0.65rem]" method="POST" use:enhance={enhanceGate} aria-busy={submitting}>
      <Field label="Lykilorð">
        <Input name="password" type="password" autocomplete="current-password" required />
      </Field>
      <input type="hidden" name="redirectTo" value={form?.redirectTo ?? data.redirectTo} />
      <Button intent="primary" type="submit" class="mt-[0.4rem]" disabled={submitting}>Opna</Button>
    </form>
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
