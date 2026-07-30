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

<section class="readiness" aria-label={label} data-readiness-state={state}>
  <div class="readiness-head">
    <Status tone={stateTones[state]} class="state">{stateLabel}</Status>
    <p>{summary}</p>
  </div>
  {#if issues.length > 0}
    <ul>
      {#each issues as issue (issue.sectionId + issue.label)}
        <li data-severity={issue.severity}>
          <a
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
  .readiness {
    display: grid;
    gap: 0.65rem;
    border: 1px solid var(--hv-border-subtle);
    border-left: 0.35rem solid var(--hv-color-success);
    border-radius: var(--hv-radius-panel);
    background: var(--hv-color-snow-raised);
    padding: 0.8rem 0.9rem;
  }
  .readiness[data-readiness-state='attention'] {
    border-left-color: var(--hv-color-signal);
  }
  .readiness[data-readiness-state='blocked'] {
    border-left-color: var(--hv-color-danger);
  }
  .readiness-head {
    display: grid;
    gap: 0.2rem;
  }
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
  p,
  ul {
    margin: 0;
  }
  p {
    color: var(--hv-color-basalt-muted);
    font-size: 0.84rem;
    line-height: 1.4;
  }
  ul {
    display: grid;
    gap: 0.4rem;
    padding: 0;
    list-style: none;
  }
  li {
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-signal-soft);
    padding: 0.45rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 800;
  }
  li[data-severity='blocking'] {
    background: var(--hv-color-danger-soft);
  }
  a {
    color: var(--hv-color-basalt);
  }
  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
  }
</style>
