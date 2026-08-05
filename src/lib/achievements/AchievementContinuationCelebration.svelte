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

<!-- Not <Panel>: this card needs a moss-tinted gradient background, which Panel's contract
     cannot carry (its border/radius/shadow/background ship as one matched set that callers must
     not override - see Panel.svelte's class-prop doc comment). The panel recipe is reproduced
     here as scoped token CSS instead, on the caller's own element (the SelectedPlaceCard
     precedent: carry only the tokens that render, rather than fighting the primitive). -->
<section
  class="continuation grid grid-cols-[5.5rem_minmax(0,_1fr)] items-center gap-4 border border-[color-mix(in_srgb,_var(--hv-color-moss)_34%,_transparent)] rounded-panel bg-[linear-gradient(135deg,_color-mix(in_srgb,_var(--hv-color-moss)_10%,_white),_var(--hv-color-snow-raised))] shadow-raised max-[30rem]:grid-cols-[4.5rem_minmax(0,_1fr)]"
  aria-label={copy['achievements.celebrationRegion'].replace('{name}', name)}
>
  <span class="badge block w-22 max-[30rem]:w-18">
    <AchievementBadge
      achievementKey={`contributions_${continuation.milestone}`}
      collection="contributions"
      group="contribution_quality"
      state="earned"
    />
  </span>
  <div class="copy grid gap-[0.45rem]">
    <p class="eyebrow m-0 text-[0.72rem] font-black tracking-widest uppercase text-moss">
      {copy['achievements.celebrationEyebrow']}
    </p>
    <h2 class="m-0 font-display text-[clamp(1.25rem,_4vw,_1.65rem)]">{name}</h2>
    <p class="m-0">{description}</p>
    <AchievementShare card={shareCard} {copy} />
  </div>
</section>
