<script lang="ts">
  import { Status } from '@hundavaent/design-system';

  import type { ModerationReadinessState, ModerationReviewIssue } from './types';

  interface Props {
    label: string;
    state: ModerationReadinessState;
    stateLabel: string;
    summary: string;
    issues?: readonly ModerationReviewIssue[];
  }

  let { label, state, stateLabel, summary, issues = [] }: Props = $props();

  // Status has no signal-toned tone, so 'attention' borrows the signal-family 'verified' tone
  // (solid signal background) as the nearest look-based fit - the readiness state itself stays
  // fully legible via data-readiness-state's left-border tint and the stateLabel copy.
  const stateTones: Record<ModerationReadinessState, 'success' | 'verified' | 'error'> = {
    ready: 'success',
    attention: 'verified',
    blocked: 'error'
  };

  // This handler, and the #sectionId anchors below, depend on ModerationReviewSection rendering
  // a literal <details id="..."> per section - a deliberate phase-6 decision (see the comment on
  // ModerationReviewSection.svelte) that keeps that component off the package Disclosure.
  function revealSection(event: MouseEvent, sectionId: string): void {
    const target = document.getElementById(sectionId);
    if (!(target instanceof HTMLDetailsElement)) return;
    target.open = true;
    event.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    target.querySelector<HTMLElement>('summary')?.focus();
    history.replaceState(history.state, '', `#${sectionId}`);
  }
</script>

<section
  class="readiness grid gap-[0.65rem] py-[0.8rem] px-[0.9rem] border border-border-subtle border-l-[0.35rem] border-l-success rounded-panel bg-snow-raised data-[readiness-state=attention]:border-l-signal data-[readiness-state=blocked]:border-l-danger"
  aria-label={label}
  data-readiness-state={state}
>
  <div class="readiness-head grid gap-[0.2rem]">
    <Status tone={stateTones[state]} class="state">{stateLabel}</Status>
    <p class="m-0 text-[0.84rem] leading-[1.4] text-basalt-muted">{summary}</p>
  </div>
  {#if issues.length > 0}
    <ul class="grid gap-[0.4rem] m-0 p-0 list-none">
      {#each issues as issue (issue.sectionId + issue.label)}
        <li
          class="py-[0.45rem] px-[0.55rem] rounded-control bg-signal-soft text-[0.8rem] font-extrabold data-[severity=blocking]:bg-danger-soft"
          data-severity={issue.severity}
        >
          <a
            class="text-basalt focus-visible:outline-[3px] focus-visible:outline-focus-ring focus-visible:outline-offset-[3px]"
            href={`#${issue.sectionId}`}
            onclick={(event) => revealSection(event, issue.sectionId)}
          >
            {issue.label}
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  /* Status renders its span inside a child component, so Svelte's scoped CSS cannot reach it
     directly - the .state class is guaranteed to land on that rendered element because we pass
     it through Status's class prop ourselves (the FavouriteControl precedent). Only the
     non-conflicting layout/typography left over from the old bespoke pill (letter-spacing,
     uppercase) lives here; background/text/radius/padding now come from Status's tone. */
  .readiness-head :global(.state) {
    width: fit-content;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
