<script lang="ts">
  import type { ModerationReadinessState, ModerationReviewIssue } from './types';

  interface Props {
    label: string;
    state: ModerationReadinessState;
    stateLabel: string;
    summary: string;
    issues?: readonly ModerationReviewIssue[];
  }

  let { label, state, stateLabel, summary, issues = [] }: Props = $props();

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
    <span class="state">{stateLabel}</span>
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
  .state {
    width: fit-content;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-success-soft);
    padding: 0.18rem 0.48rem;
    color: var(--hv-color-basalt);
    font-size: 0.7rem;
    font-weight: 950;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  [data-readiness-state='attention'] .state {
    background: var(--hv-color-signal-soft);
  }
  [data-readiness-state='blocked'] .state {
    background: var(--hv-color-danger-soft);
    color: var(--hv-color-danger);
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
    font-weight: 850;
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
