<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import { formatLocalizedDate } from '$i18n/date';
  import {
    localizeAccessArea,
    localizePermission,
    localizePlaceCategory,
    localizeRestraint
  } from '$i18n/structured-place';
  import type { AccessArea, PermissionRequirement, RestraintCondition } from '$lib/domain/access';
  import type { PlaceCategory } from '$lib/domain/place';
  import ImpactPillarIcon from '$lib/impact/ImpactPillarIcon.svelte';

  import type { ActionData, PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let submittingTaskId = $state<string | null>(null);

  const formState = $derived(form as ActionData | null);
  const canVerify = $derived((data as typeof data & { canVerify?: boolean }).canVerify ?? true);

  function enhanceTask(taskId: string) {
    submittingTaskId = taskId;
    return async ({ update }: { update: () => Promise<void> }) => {
      await update();
      submittingTaskId = null;
    };
  }

  function stringValue(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
  }

  function outcomeLabel(outcome: string): string {
    const key = `trustedVerification.outcome.${outcome}` as keyof typeof data.copy;
    return data.copy[key] ?? outcome;
  }
</script>

<svelte:head>
  <title>{data.copy['trustedVerification.title']} | {data.copy['site.name']}</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main class="trusted-shell hv-page-shell" data-ui-mode="place" data-width="wide">
  <header class="hv-page-header trusted-header">
    <div class="header-icon" aria-hidden="true">
      <ImpactPillarIcon kind="recognition" size="large" />
    </div>
    <div>
      <p class="hv-eyebrow">{data.copy['trustedVerification.eyebrow']}</p>
      <h1 class="hv-page-title">{data.copy['trustedVerification.title']}</h1>
      <p class="hv-meta">{data.copy['trustedVerification.intro']}</p>
    </div>
    <div class="hv-page-actions">
      <a class="hv-control" href={resolve('/[lang=lang]/account', { lang: data.lang })}>
        {data.copy['trustedVerification.backToAccount']}
      </a>
    </div>
  </header>

  {#if formState?.success}
    <section
      class="submission-celebration hv-panel hv-stack"
      aria-live="polite"
      data-testid="trusted-submission-success"
    >
      <span class="celebration-icon" aria-hidden="true">
        <ImpactPillarIcon kind="contribution" size="large" />
      </span>
      <div>
        <h2>{data.copy['trustedVerification.submittedTitle']}</h2>
        <p>{data.copy['trustedVerification.submittedBody']}</p>
        {#if formState.weeklyActivated}
          <p class="weekly-note">{data.copy['trustedVerification.weeklyActivated']}</p>
        {/if}
      </div>
    </section>
  {:else if formState?.error}
    <p class="hv-notice" data-tone="error" role="alert">
      {formState.error === 'forbidden'
        ? data.copy['trustedVerification.trustedRequired']
        : formState.error === 'rate_limited'
          ? data.copy['trustedVerification.rateLimited']
          : formState.error === 'conflict'
            ? data.copy['trustedVerification.conflict']
            : formState.error === 'policy_unavailable'
              ? data.copy['trustedVerification.policyUnavailable']
              : data.copy['trustedVerification.invalid']}
    </p>
  {/if}

  {#if !canVerify}
    <p class="hv-notice" data-tone="info" role="status">
      {data.copy['trustedVerification.trustedRequired']}
    </p>
  {/if}

  {#if canVerify}
    <section class="task-section hv-stack" aria-labelledby="task-heading">
      <div>
        <p class="hv-eyebrow">{data.copy['trustedVerification.taskEyebrow']}</p>
        <h2 id="task-heading">{data.copy['trustedVerification.taskHeading']}</h2>
        <p class="hv-meta">{data.copy['trustedVerification.taskIntro']}</p>
      </div>

      {#if data.tasks.length === 0}
        <section class="empty-state hv-panel hv-stack">
          <span aria-hidden="true">✓</span>
          <h3>{data.copy['trustedVerification.emptyTitle']}</h3>
          <p>{data.copy['trustedVerification.emptyBody']}</p>
        </section>
      {:else}
        <div class="task-grid">
          {#each data.tasks as task (task.taskId)}
            <article class="task-card hv-panel hv-stack" data-task-kind={task.taskKind}>
              <header>
                <div class="task-icon" aria-hidden="true">
                  <ImpactPillarIcon
                    kind={task.taskKind === 'access_freshness' ? 'knowledge' : 'contribution'}
                    size="small"
                  />
                </div>
                <div>
                  <p class="task-kind">
                    {task.taskKind === 'access_freshness'
                      ? data.copy['trustedVerification.kind.accessFreshness']
                      : data.copy['trustedVerification.kind.dogAmenities']}
                  </p>
                  <h3>{task.placeName}</h3>
                </div>
              </header>

              <p class="task-context">
                {localizePlaceCategory(task.category as PlaceCategory, data.copy)}
                <span aria-hidden="true">·</span>
                {task.municipality}
              </p>

              {#if task.taskKind === 'access_freshness'}
                <dl class="fact-list">
                  <div>
                    <dt>{data.copy['trustedVerification.accessArea']}</dt>
                    <dd>
                      {localizeAccessArea(
                        stringValue(task.currentValue.access_area) as AccessArea,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{data.copy['trustedVerification.restraint']}</dt>
                    <dd>
                      {localizeRestraint(
                        stringValue(task.currentValue.restraint_condition) as RestraintCondition,
                        data.copy
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{data.copy['trustedVerification.permission']}</dt>
                    <dd>
                      {localizePermission(
                        stringValue(
                          task.currentValue.permission_requirement
                        ) as PermissionRequirement,
                        data.copy
                      )}
                    </dd>
                  </div>
                  {#if task.freshnessUntil}
                    <div>
                      <dt>{data.copy['trustedVerification.freshnessUntil']}</dt>
                      <dd>{formatLocalizedDate(task.freshnessUntil, data.lang)}</dd>
                    </div>
                  {/if}
                </dl>
                <p class="hv-meta">{data.copy['trustedVerification.accessHint']}</p>
              {:else}
                <p>{data.copy['trustedVerification.amenitiesHint']}</p>
              {/if}

              <details>
                <summary class="hv-control" data-intent="primary">
                  {data.copy['trustedVerification.openTask']}
                </summary>
                <form
                  class="verification-form hv-stack"
                  method="POST"
                  use:enhance={() => enhanceTask(task.taskId)}
                  aria-busy={submittingTaskId === task.taskId}
                >
                  <input type="hidden" name="taskId" value={task.taskId} />
                  <input type="hidden" name="commandId" value={data.taskRequestIds[task.taskId]} />

                  {#if task.taskKind === 'dog_amenities'}
                    <label class="hv-stack">
                      {data.copy['trustedVerification.amenitiesLabel']}
                      <input
                        class="hv-field"
                        name="amenities"
                        placeholder={data.copy['trustedVerification.amenitiesPlaceholder']}
                        required
                      />
                      <span class="hv-meta">{data.copy['trustedVerification.amenitiesHelp']}</span>
                    </label>
                  {:else}
                    <p class="confirmation">
                      <span aria-hidden="true">✓</span>
                      {data.copy['trustedVerification.confirmAccess']}
                    </p>
                  {/if}

                  <fieldset class="hv-form-section">
                    <legend>{data.copy['evidenceField.section']}</legend>
                    <div class="hv-grid" data-columns="2">
                      <label class="hv-stack">
                        {data.copy['evidenceField.kind']}
                        <select class="hv-field" name="evidenceKind" required>
                          <option value="direct_observation">
                            {data.copy['evidence.directObservation']}
                          </option>
                          <option value="official_website">
                            {data.copy['evidence.officialWebsite']}
                          </option>
                          <option value="venue_representative">
                            {data.copy['evidence.venueRepresentative']}
                          </option>
                          <option value="public_record">{data.copy['evidence.publicRecord']}</option
                          >
                          <option value="other">{data.copy['evidence.other']}</option>
                        </select>
                      </label>
                      <label class="hv-stack">
                        {data.copy['evidenceField.label']}
                        <input class="hv-field" name="evidenceSourceLabel" required />
                      </label>
                    </div>
                    <div class="hv-grid" data-columns="2">
                      <label class="hv-stack">
                        {data.copy['evidenceField.url']}
                        <input class="hv-field" name="evidenceUrl" type="url" />
                      </label>
                      <label class="hv-stack">
                        {data.copy['evidenceField.citation']}
                        <input class="hv-field" name="evidenceCitation" />
                      </label>
                    </div>
                    <label class="hv-stack">
                      {data.copy['evidenceField.observedAt']}
                      <input
                        class="hv-field"
                        name="evidenceObservedAt"
                        type="datetime-local"
                        required
                      />
                    </label>
                  </fieldset>

                  <label class="hv-stack">
                    {data.copy['trustedVerification.explanationLabel']}
                    <textarea class="hv-field" name="explanation" rows="3" required></textarea>
                    <span class="hv-meta">{data.copy['trustedVerification.privacyNote']}</span>
                  </label>

                  <button
                    class="hv-control"
                    data-intent="primary"
                    type="submit"
                    disabled={submittingTaskId !== null}
                  >
                    {submittingTaskId === task.taskId
                      ? data.copy['trustedVerification.sending']
                      : data.copy['trustedVerification.submit']}
                  </button>
                </form>
              </details>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="history-section hv-stack" aria-labelledby="history-heading">
    <div>
      <p class="hv-eyebrow">{data.copy['trustedVerification.historyEyebrow']}</p>
      <h2 id="history-heading">{data.copy['trustedVerification.historyHeading']}</h2>
      <p class="hv-meta">{data.copy['trustedVerification.historyIntro']}</p>
    </div>

    {#if data.history.length === 0}
      <p class="hv-panel empty-history">{data.copy['trustedVerification.historyEmpty']}</p>
    {:else}
      <ul class="history-list">
        {#each data.history as item (item.submissionId)}
          <li class="history-item hv-panel" data-outcome={item.outcome}>
            <span class="outcome-icon" aria-hidden="true">
              {item.outcome === 'accepted'
                ? '✓'
                : item.outcome === 'rejected' || item.outcome === 'revoked'
                  ? '–'
                  : item.outcome === 'superseded'
                    ? '↗'
                    : '•'}
            </span>
            <div>
              <div class="history-title">
                <h3>{item.placeName}</h3>
                <span class="outcome-label">{outcomeLabel(item.outcome)}</span>
              </div>
              <p class="hv-meta">
                {item.taskKind === 'access_freshness'
                  ? data.copy['trustedVerification.kind.accessFreshness']
                  : data.copy['trustedVerification.kind.dogAmenities']}
                ·
                {formatLocalizedDate(item.submittedAt, data.lang)}
              </p>
              {#if item.memberReason}<p>{item.memberReason}</p>{/if}
              {#if item.outcome === 'accepted'}
                <a
                  class="history-link"
                  href={resolve('/[lang=lang]/places/[id]', {
                    lang: data.lang,
                    id: item.placeId
                  })}
                >
                  {data.copy['trustedVerification.viewPlace']}
                </a>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .trusted-shell {
    --trusted-tone: var(--hv-color-moss);
    gap: clamp(2rem, 5vw, 4rem);
  }

  .trusted-header {
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .header-icon,
  .task-icon {
    --impact-tone: var(--trusted-tone);
  }

  .submission-celebration {
    --impact-tone: var(--hv-color-moss);
    position: relative;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    overflow: hidden;
    border-color: color-mix(in srgb, var(--hv-color-moss) 42%, var(--hv-color-border));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hv-color-moss) 14%, var(--hv-color-surface)) 0%,
      var(--hv-color-surface) 32%
    );
  }

  .celebration-icon {
    animation: trusted-arrival 640ms cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
  }

  .weekly-note {
    color: var(--hv-color-moss);
    font-weight: 700;
  }

  .task-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }

  .task-card {
    align-content: start;
  }

  .task-card > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.8rem;
    align-items: center;
  }

  .task-card h3,
  .history-item h3 {
    margin: 0;
  }

  .task-kind,
  .task-context {
    margin: 0;
    color: var(--hv-color-muted);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .fact-list {
    display: grid;
    gap: 0.55rem;
    margin: 0;
  }

  .fact-list div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.42fr) minmax(0, 1fr);
    gap: 0.75rem;
  }

  .fact-list dt {
    color: var(--hv-color-muted);
  }

  .fact-list dd {
    margin: 0;
    font-weight: 650;
  }

  details {
    margin-top: auto;
  }

  summary {
    width: fit-content;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .verification-form {
    margin-top: 1rem;
    border-top: 1px solid var(--hv-color-border);
    padding-top: 1rem;
  }

  .confirmation {
    display: flex;
    gap: 0.55rem;
    align-items: center;
    border-radius: 0.8rem;
    background: color-mix(in srgb, var(--hv-color-moss) 9%, white);
    padding: 0.8rem;
  }

  .confirmation span {
    color: var(--hv-color-moss);
    font-weight: 900;
  }

  .empty-state {
    place-items: center;
    text-align: center;
  }

  .empty-state > span {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--hv-color-moss) 14%, white);
    color: var(--hv-color-moss);
    font-size: 1.5rem;
    font-weight: 900;
  }

  .history-list {
    display: grid;
    gap: 0.75rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .history-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.85rem;
    align-items: start;
  }

  .outcome-icon {
    display: grid;
    width: 2.2rem;
    height: 2.2rem;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--hv-color-moss) 12%, white);
    color: var(--hv-color-moss);
    font-weight: 900;
  }

  .history-item[data-outcome='rejected'] .outcome-icon,
  .history-item[data-outcome='revoked'] .outcome-icon,
  .history-item[data-outcome='unavailable'] .outcome-icon {
    background: color-mix(in srgb, var(--hv-color-muted) 12%, white);
    color: var(--hv-color-muted);
  }

  .history-title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: baseline;
    justify-content: space-between;
  }

  .outcome-label {
    border-radius: 999px;
    background: color-mix(in srgb, var(--hv-color-moss) 10%, white);
    padding: 0.25rem 0.55rem;
    color: var(--hv-color-moss);
    font-size: 0.82rem;
    font-weight: 750;
  }

  .history-link {
    color: var(--hv-color-moss);
    font-weight: 700;
  }

  .empty-history {
    color: var(--hv-color-muted);
  }

  @keyframes trusted-arrival {
    from {
      opacity: 0;
      transform: translateY(0.65rem) rotate(-5deg) scale(0.88);
    }
    to {
      opacity: 1;
      transform: translateY(0) rotate(0) scale(1);
    }
  }

  @media (max-width: 760px) {
    .trusted-header,
    .task-grid {
      grid-template-columns: 1fr;
    }

    .trusted-header .header-icon {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .celebration-icon {
      animation: none;
    }
  }
</style>
