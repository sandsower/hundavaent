<script lang="ts">
  import type { Catalogue, MessageKey } from '$i18n';

  import {
    buildModerationWorkspaceHref,
    type ModerationFilterId,
    type ModerationQueueId,
    type ModerationQueueSummary
  } from './types';

  interface Props {
    copy: Catalogue;
    baseHref: string;
    queues: readonly ModerationQueueSummary[];
    activeQueueId: ModerationQueueId;
    filters: readonly ModerationFilterId[];
  }

  let { copy, baseHref, queues, activeQueueId, filters }: Props = $props();

  const queueKeys: Record<ModerationQueueId, MessageKey> = {
    suggestions: 'moderation.workspace.queue.suggestions',
    'corrections-and-reports': 'moderation.workspace.queue.correctionsAndReports',
    'candidate-places': 'moderation.workspace.queue.candidatePlaces'
  };
</script>

<nav class="queue-rail" aria-label={copy['moderation.workspace.queueNavLabel']}>
  <h2>{copy['moderation.workspace.queuesHeading']}</h2>
  <!-- Workspace URLs are canonicalized from a resolved localized base route and query state. -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <div class="queue-links">
    {#each queues as queue (queue.id)}
      <a
        class:active={queue.id === activeQueueId}
        aria-current={queue.id === activeQueueId ? 'page' : undefined}
        href={buildModerationWorkspaceHref(baseHref, {
          queue: queue.id,
          filters
        })}
      >
        <span>{copy[queueKeys[queue.id]]}</span>
        <span class="count">{queue.count}</span>
      </a>
    {/each}
  </div>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
  .queue-rail {
    min-width: 0;
    border-right: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow);
    padding: 0.9rem;
  }
  h2 {
    margin: 0.25rem 0.55rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 950;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  .queue-links {
    display: grid;
    gap: 0.4rem;
  }
  a {
    display: grid;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--hv-radius-control);
    padding: 0.65rem;
    color: var(--hv-color-basalt);
    font-weight: 780;
    text-decoration: none;
  }
  a:hover {
    background: var(--hv-color-snow-raised);
  }
  a.active {
    border-color: var(--hv-color-basalt);
    background: var(--hv-color-signal);
    font-weight: 950;
    box-shadow: none;
  }
  a:focus-visible {
    outline: 3px solid var(--hv-focus-ring);
    outline-offset: 3px;
    box-shadow: 0 0 0 2px var(--hv-focus-offset);
  }
  .count {
    min-width: 1.75rem;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    padding: 0.18rem 0.42rem;
    color: var(--hv-color-snow-raised);
    font-size: 0.72rem;
    font-weight: 900;
    text-align: center;
  }
  @media (max-width: 44rem) {
    .queue-rail {
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid var(--hv-border-subtle);
      padding: 0.65rem;
    }
    h2 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .queue-links {
      display: flex;
      width: max-content;
      gap: 0.45rem;
    }
    a {
      width: auto;
      flex: none;
      white-space: nowrap;
    }
  }
</style>
