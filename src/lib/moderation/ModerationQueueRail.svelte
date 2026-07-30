<script lang="ts">
  import { Button } from '@hundavaent/design-system';
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
      <Button
        class="queue-link"
        intent={queue.id === activeQueueId ? 'committed' : 'neutral'}
        aria-current={queue.id === activeQueueId ? 'page' : undefined}
        href={buildModerationWorkspaceHref(baseHref, {
          queue: queue.id,
          filters
        })}
      >
        <span>{copy[queueKeys[queue.id]]}</span>
        <span class="count">{queue.count}</span>
      </Button>
    {/each}
  </div>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
</nav>

<style>
  .queue-rail {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    border-right: 1px solid var(--hv-border-subtle);
    background: var(--hv-color-snow);
    padding: 0.9rem;
  }
  h2 {
    margin: 0.25rem 0.55rem 0.7rem;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }
  .queue-links {
    display: grid;
    gap: 0.4rem;
  }
  /* Button renders its own <a> inside a child component, so Svelte's scoped CSS cannot reach it
     directly - the .queue-link class is guaranteed to land on that rendered element because we
     pass it through Button's class prop ourselves (the FavouriteControl precedent). Border
     colour, background, text colour, weight, and focus ring now come from Button's intent/base
     classes; only the rail-specific grid layout for the label + count pair survives here. */
  .queue-rail :global(.queue-link) {
    display: grid;
    box-sizing: border-box;
    min-width: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.55rem;
    padding: 0.65rem;
    text-decoration: none;
  }
  .count {
    min-width: 1.75rem;
    border-radius: var(--hv-radius-control);
    background: var(--hv-color-basalt);
    padding: 0.18rem 0.42rem;
    color: var(--hv-color-snow-raised);
    font-size: 0.72rem;
    font-weight: 800;
    text-align: center;
  }
  @media (max-width: 60rem) {
    .queue-rail {
      overflow-x: auto;
      overflow-y: hidden;
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
    .queue-rail :global(.queue-link) {
      width: auto;
      flex: none;
      white-space: nowrap;
    }
  }
  @media (max-width: 44rem) {
    .queue-rail {
      overflow-x: hidden;
      padding: 0.55rem;
    }
    .queue-links {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.35rem;
    }
    .queue-rail :global(.queue-link) {
      width: 100%;
      min-height: 4.25rem;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 1fr auto;
      gap: 0.25rem;
      justify-items: center;
      padding: 0.45rem 0.25rem;
      font-size: 0.75rem;
      line-height: 1.15;
      text-align: center;
      white-space: normal;
    }
    .count {
      min-width: 1.5rem;
      padding: 0.12rem 0.35rem;
      font-size: 0.66rem;
    }
  }
</style>
