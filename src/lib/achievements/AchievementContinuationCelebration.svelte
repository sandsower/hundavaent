<script lang="ts">
  import type { Catalogue } from '$i18n';
  import type { ClaimedAchievementContinuation } from '$server/achievements/achievements';
  import AchievementBadge from './AchievementBadge.svelte';
  import AchievementShare from './AchievementShare.svelte';

  interface Props {
    continuation: ClaimedAchievementContinuation;
    copy: Catalogue;
  }

  let { continuation, copy }: Props = $props();

  const name = $derived(
    copy['achievements.continuation.name'].replace('{milestone}', String(continuation.milestone))
  );
  const description = $derived(
    copy['achievements.continuation.description'].replace(
      '{milestone}',
      String(continuation.milestone)
    )
  );
  const shareCard = $derived({
    achievementKey: `contributions_${continuation.milestone}`,
    collection: 'contributions',
    group: 'contribution_quality' as const,
    tier: null,
    name,
    description,
    brand: copy['site.name'],
    eyebrow: copy['achievements.share.cardEyebrow']
  });
</script>

<section
  class="continuation"
  aria-label={copy['achievements.celebrationRegion'].replace('{name}', name)}
>
  <span class="badge">
    <AchievementBadge
      achievementKey={`contributions_${continuation.milestone}`}
      collection="contributions"
      group="contribution_quality"
      state="earned"
    />
  </span>
  <div class="copy">
    <p class="eyebrow">{copy['achievements.celebrationEyebrow']}</p>
    <h2>{name}</h2>
    <p>{description}</p>
    <AchievementShare card={shareCard} {copy} />
  </div>
</section>

<style>
  /* Not <Panel>: this card needs a moss-tinted gradient background, which Panel's contract
     cannot carry (its border/radius/shadow/background ship as one matched set that callers must
     not override - see Panel.svelte's class-prop doc comment). The panel recipe is reproduced
     here as scoped token CSS instead, on the caller's own element (the SelectedPlaceCard
     precedent: carry only the tokens that render, rather than fighting the primitive). */
  .continuation {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 1rem;
    align-items: center;
    border: 1px solid var(--hv-border-subtle);
    border-radius: var(--hv-radius-panel);
    box-shadow: var(--hv-shadow-raised);
    border-color: color-mix(in srgb, var(--hv-color-moss) 34%, transparent);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--hv-color-moss) 10%, white),
      var(--hv-color-snow-raised)
    );
  }

  .badge {
    display: block;
    width: 5.5rem;
  }

  .copy {
    display: grid;
    gap: 0.45rem;
  }

  .eyebrow,
  h2,
  p {
    margin: 0;
  }

  .eyebrow {
    color: var(--hv-color-moss);
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    font-family: var(--hv-font-display);
    font-size: clamp(1.25rem, 4vw, 1.65rem);
  }

  @media (max-width: 30rem) {
    .continuation {
      grid-template-columns: 4.5rem minmax(0, 1fr);
    }

    .badge {
      width: 4.5rem;
    }
  }
</style>
