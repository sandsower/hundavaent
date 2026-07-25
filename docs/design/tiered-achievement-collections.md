# Tiered achievement collections design

## Status

approved

## Source Requirements

- Phase: "tiered collection with visible gaps", first of the three agreed gamification phases.
- Sequence agreed previously: tiered collection with visible gaps, then a streak on deep actions only, then population-gated freshness events.
- No spec artifact exists on disk.
- Behaviour was approved conversationally and the four shaping decisions plus ten stress-test findings recorded below are the authoritative record.

## Problem

Ten achievements exist today, but the member cannot see the shape of what is ahead.

Migration `202607230005_selective_achievement_progress.sql` already softened the original all-or-nothing model: it added a versioned `locked_visibility` column (`milestone` or `surprise`) and per-definition `progress_kind`, and set the three exploration achievements to `milestone` with recomputed progress.

Three restrictions remain, and together they mean a member sees almost nothing of what is available.

- A `surprise` definition never leaves the database before it is earned, which covers seven of the ten.
- A `milestone` with zero progress is filtered out by `progress.current_value > 0`.
- At most two milestones are ever returned, enforced by `relevance_rank <= 2` in SQL and mirrored by a `milestoneCount > 2` rejection in the client parser.

## Desired Outcome

Four count-based achievements become three-tier collections rendered as a grid where locked tiers are visible, so the gaps themselves pull the member forward.

The six remaining achievements stay single and hidden until earned, preserving the surprise.

## Recommended Approach

### Shaping decisions

1. **Locked visibility is per definition.** Tiered collections are fully visible when locked, showing their threshold. `surprise` survives untouched for the bespoke six.
2. **A tier is its own definition key**, grouped by a `collection`. The immutable unlock ledger, its `unique (member_id, achievement_key)` index, the evaluator's unlock-once-per-key contract and per-unlock version pinning all keep working, because a tier unlock is an ordinary unlock.
3. **The existing four count-based keys are replaced, not adopted.** The migration deletes those four definition rows and inserts twelve uniformly named tier rows, which is safe only while no unlock pins one of their versions. That condition is asserted rather than assumed - see the note under Edge Cases and Risks, which records what happened when it was assumed.
4. **Four collections, not seven.** Only the achievements that already count something and already pass through the anti-burst spacing rule become collections.

### Catalogue

| Collection         | Metric                    | Bronze | Silver | Gold |
| ------------------ | ------------------------- | ------ | ------ | ---- |
| `explorer_places`  | `credited_places`         | 5      | 10     | 15   |
| `place_categories` | `credited_categories`     | 2      | 3      | 4    |
| `municipalities`   | `credited_municipalities` | 2      | 3      | 4    |
| `contributions`    | `confirmed_contributions` | 1      | 3      | 10   |

Tier keys are `<collection>_<tier>`, so `explorer_places_bronze` through `contributions_gold`.

Bespoke and untouched: `first_favourite`, `first_rating`, `first_checkin`, `sustained_quality_contributor`, `six_month_member`, `one_year_member`.

No tier depends on complete taxonomy coverage.

`place_categories` gold stops at 4 of 5 so it never requires an accommodation check-in, and `municipalities` gold stops at 4 of 7 so it never requires visits to Kjósarhreppur or Seltjarnarnes.

`contributions` silver sits at 3, below the Trusted Contributor threshold of 5 configured in `production.yml`, so the tier ladder steps around the one recognition that carries real standing instead of co-celebrating with it.

### Schema

A new `private.achievement_collections` table holds each collection's bilingual name and description exactly once.

Without it that copy would be repeated across three tier rows with no constraint keeping them equal.

`private.achievement_definitions` gains `collection` (referencing the new table) and `tier`, and loses `locked_visibility`.

The dropped column carries no information that `collection is not null` does not already carry, and keeping it means keeping a second place for the same fact to disagree.

Four constraints express the shape as both-or-neither rules.

- `tier in ('bronze', 'silver', 'gold')` when present.
- `(collection is null) = (tier is null)`, so a tier only exists inside a collection.
- `(collection is not null) = (progress_kind is not null)`, so every tier has a metric and no bespoke achievement does.
- A tier has null `name_is`, `name_en`, `description_is` and `description_en`; a bespoke achievement has all four. The four columns become nullable to allow this.
- `collection is null or criteria ? 'threshold'`, so a tier always carries the threshold the generic evaluator reads.

`progress_kind` gains its fourth value, `confirmed_contributions`.

A unique index on `(collection, tier, version)` prevents two definitions claiming the same rung.

`display_order` is left not-null and unique per version as today. Collections order by the minimum `display_order` among their tiers, so no second ordering column is introduced.

### Tier copy is derived, not authored

A tier renders as its collection name plus a tier label, with its description templated from its metric and threshold.

Twelve tiers times four strings would be forty-eight bilingual strings whose only consumer is the celebration card, and writing three distinct evocative Icelandic names for 5, 10 and 15 places is a losing exercise.

Derived copy needs roughly sixteen i18n strings and invents no names.

This is why the four copy columns become nullable for tiers, and why `claim_my_achievement_celebrations` must also return `collection`, `tier`, `progress_kind` and the threshold: the celebration card can no longer read a name off the definition row.

### One metric pass, set-based evaluation

A new `private.member_achievement_metrics(member, as_of, spacing_minutes)` returns all four metrics from a single `credit_spaced_places` call, with the category and municipality counts derived from that one credited-place set.

This matters because `credit_spaced_places` is a row-by-row PL/pgSQL loop over the member's entire check-in history, invoked from a trigger on every favourite, rating, check-in and contribution write.

Today three of the ten keys invoke it, so a check-in runs it three times.

Naive per-definition tier evaluation would run it nine times, six of them recomputing an identical number, and `get_member_achievement_progress` would go the same way on every page load.

After this change it runs once per call, which is better than the three the current code does.

Tier evaluation becomes set-based in both directions.

- Unlocking joins the latest tier definitions to the metrics and inserts every qualifying key with no existing unlock, keeping `on conflict (member_id, achievement_key) do nothing`.
- Negative-signal recalculation joins the member's existing tier unlocks to the metrics through `d.version = u.definition_version`, so a threshold is always compared against the version the unlock was earned under, and writes an `achievement_recalculations` row when it no longer holds.

`evaluate_achievement_criteria` narrows to the six bespoke keys and is renamed `evaluate_bespoke_achievement_criteria`.

The rename is the point: a function that silently returns false for a tier key is a footgun, and the narrowed name makes the seam visible.

`get_member_achievement_progress` is replaced by joining the same metrics to the tier definitions.

### Read path

`get_my_achievements` drops both `relevance_rank <= 2` and `current_value > 0`, and returns every tier slot in all three states plus every earned bespoke achievement.

It gains `collection`, `tier`, `collection_name_is`, `collection_name_en`, `collection_description_is` and `collection_description_en`, so one read serves the whole grid.

`entry_kind` becomes `earned | locked`.

Surprise definitions still never leave the database before earning, because the locked branch selects only rows with `collection is not null`.

The cap moves to the callers, which is where the layout constraint actually lives.

The achievements page renders all twelve slots.

The impact page keeps its own four-item rule, selecting the closest in-progress tiers plus recent earned, replacing arithmetic that silently depended on the database cap.

### Presentation

Tier is expressed structurally, within the existing palette.

An earned cell fills with moss, an in-progress cell shows a fjord ring with its progress arc, and a locked cell is a dashed outline showing its threshold.

Bronze, silver and gold appear as text labels and as increasing weight across the row.

No new colour tokens are introduced.

`tokens.css` defines only basalt, moss, signal, snow and snow-raised, gold must not borrow Signal Yellow because the north star reserves it for verified access, selection and committed actions and lists decorative Signal Yellow as an anti-pattern, and a vault note records that undefined CSS custom properties fail silently and invisibly rather than erroring.

Accessibility: each collection reads as text, and `role="progressbar"` appears only on a collection's _nearest unearned_ tier.

The original rule here was "only on in-progress tiers", which was wrong: any tier of a started collection has `current > 0`, so all three would have reported the same number and a screen reader would have heard it three times per collection.

Bounding it to the nearest unearned tier gives one active target per collection, at most four, and matches how a member actually reads the row.

Motion uses the `--hv-motion-*` family, which the motion token system brought to `main` in `0d53cc2` while this phase was in flight.

The progress fill animates `width`, a size change the eye reads as movement, so it belongs to the motion family rather than the fade family. That family already collapses to zero under reduced motion, so the component carries no local `prefers-reduced-motion` query at all. An earlier draft of this design predated those tokens and specified the local-media-query pattern; the drift test that shipped with them correctly rejected it.

### Copy

`achievements.empty` is retired.

Twelve slots are always present once the policy is enabled, so `groups.length === 0 && milestones.length === 0` becomes unreachable, and the grid itself is the answer to a member with no activity.

A new intro frames it as the map of what is ahead.

One honest line explains that places count when visits are spread through the day.

The 15-minute spacing rule is currently explained nowhere, and twelve slots of hard checkable numbers make the discrepancy prominent: a member who visits four places within fifteen minutes sees 1 of 5 and deserves to know why.

The rule itself is untouched.

## Alternatives Considered

- **Drop `surprise` entirely so every definition is visible**: fullest grid, but discards a deliberate shipped policy and leaks the whole catalogue.
- **Silhouette slots for surprises**: truest to the Pokedex metaphor, but an unnamed slot is not actionable, so it teases rather than pulls.
- **Family key plus a `tier` column on unlocks**: fewer rows, but reopens the immutability trigger, the ledger uniqueness invariant that was deliberately made structural, the moderation RPC, both reads and the client parser at once.
- **Thresholds array in `criteria`, tiers derived at read time**: does not work. Unlocks are immutable, so bronze cannot be upgraded to silver in place and per-tier rows return anyway.
- **Adopting the four existing keys as tiers**: chosen initially for FK safety, rejected once the empty-ledger assertion made it unnecessary. It would have left two naming conventions and a key hardcoding a threshold it no longer owns.
- **A second RPC for the grid**: no regression risk on the impact page, but two overlapping reads, two parsers and two test sets.
- **A parameterised database cap**: one parser, but pushes a layout number into a database signature and leaves the ranking invisible to the designer.
- **Visible participation firsts**: strongest on-ramp for a brand-new member, rejected to keep the first favourite, rating and check-in as celebrations rather than listed chores.
- **Progressive tier reveal**: gentler, but re-hides the shape of what is ahead, which is the problem this phase exists to solve.
- **Keeping gold at the taxonomy ceiling with a launch-inventory coverage target**: makes a gamification threshold into a content-operations obligation, and gold stays unreachable until it is delivered.
- **Three new metallic tokens**: instantly legible, but widens a deliberately narrow palette, needs north-star sign-off, and puts gold adjacent to Signal Yellow.
- **Accepting redundant metric computation**: simplest, rejected because the cost lands on a trigger in the member's write path.

## Files / Modules

- `supabase/migrations/202607250003_tiered_achievement_collections.sql` — new. Everything below in one transaction.
- `private.achievement_collections` — new table, four seeded rows.
- `private.achievement_definitions` — add `collection`, `tier`; drop `locked_visibility`; relax the four copy columns to nullable; extend the `progress_kind` vocabulary; new constraints and unique index.
- `private.member_achievement_metrics` — new, single-pass metrics.
- `private.evaluate_bespoke_achievement_criteria` — renamed and narrowed from `evaluate_achievement_criteria`.
- `private.evaluate_achievement_unlocks` — set-based tier unlock and tier recalculation, bespoke loop retained.
- `private.get_member_achievement_progress` — dropped, replaced by joining metrics to tier definitions.
- `public.get_my_achievements` — replaced. Uncapped, plus collection and tier columns.
- `public.claim_my_achievement_celebrations` — replaced. Returns collection, tier, progress_kind and threshold.
- `src/lib/server/achievements/achievements.ts` — parser becomes a discriminated union; drop the `milestoneProgress` per-key map, the two-milestone rejection and the exploration-group restriction.
- `src/lib/server/db/generated.types.ts` — regenerate. `pnpm db:types` is broken locally, so use the documented `npx supabase gen types` workaround and strip the leading connection line before normalising.
- `src/lib/achievements/AchievementCollectionGrid.svelte` — new.
- `src/lib/achievements/AchievementTierCell.svelte` — new.
- `src/lib/achievements/AchievementMilestoneCard.svelte` — delete.
- `src/lib/achievements/AchievementIcon.svelte` — key the motif off `collection`, falling back to key for the bespoke six.
- `src/lib/achievements/AchievementCelebration.svelte` — derive tier name and description.
- `src/routes/[lang=lang]/account/achievements/+page.svelte` — grid replaces the next/archive split; retire the empty state; keep the bespoke archive.
- `src/routes/[lang=lang]/account/impact/+page.svelte` — explicit four-item selection rule.
- `src/lib/i18n/messages/en.json`, `is.json` — tier labels, metric description templates, collections intro, spacing-rule line; retire `achievements.empty`, `achievements.nextTitle`, `achievements.nextIntro`.
- `.github/workflows/production.yml` — bump `policy_version` and the coupled assertion string.

## Data / Control Flow

Write path, on favourite, rating, check-in, contribution or conduct-flag change:

```
trigger
  -> evaluate_achievement_unlocks(member, reason, as_of)
       policy gate: enabled and eligibility_started_at set and as_of >= it
       metrics := member_achievement_metrics(member, as_of, spacing)   -- one credit_spaced_places pass
       if reason is a negative signal:
            insert achievement_recalculations
              for tier unlocks failing their own pinned version's threshold
            loop bespoke unlocks -> evaluate_bespoke_achievement_criteria(pinned version)
       if has_active_conduct_flag: return
       insert achievement_unlocks
         select tier definitions where metric >= threshold and no unlock exists
       loop unearned bespoke definitions -> evaluate_bespoke_achievement_criteria
```

Read path:

```
get_my_achievements()
  -> earned:  unlocks joined to their pinned definition version
     locked:  tier definitions joined to member_achievement_metrics
              (current may be 0; surprise rows excluded by collection is not null)
  -> achievements page: all 12 slots, grid grouped by collection
  -> impact page:       own rule, closest in-progress tiers + recent earned, total 4
```

## Edge Cases and Risks

- **The migration rewrites `criteria` shape at version 1, which the original contract reserves for a new version.** Safe only while the unlock ledger is empty, so the migration asserts emptiness and raises `55000` otherwise. The assertion turns "we have no users" into an enforced invariant: if an unlock exists, the deploy fails loudly instead of silently mis-evaluating a pinned version.

  **This assumption was wrong, and the assertion is the only reason that cost nothing.** The design was written believing the ledger was empty; production held three unlocks across one member. The first deploy of `0d264166` aborted at "Apply migrations to production" with `Found 3 unlock(s) across 1 member(s). (SQLSTATE 55000)`, before any DDL, leaving production consistent on the previous release with every downstream job skipped. The rows were test data and were cleared, and the redeploy succeeded.

  Two lessons for later phases. An environment described as holding "only test data" is not the same as one holding _no_ data, and the difference is exactly what a `select 1 from ...` precondition catches. And an exception that carries its own remedy is worth the extra lines: this one reported the counts and named both branches - clear the rows, or seed at a new definition version and leave earned rows pinned - so the decision did not have to be reconstructed mid-deploy.

- **`production.yml` asserts the exact policy string `achievement-milestones-v1|15|t|t`.** Bumping `policy_version` is a coupled edit in two places in that workflow or the deploy fails. `eligibility_started_at` is preserved by `coalesce` either way, so the bump is purely a label.
- **Raising `explorer_places` gold later widens a visible gap without explanation.** A member at 12 of 15 would see 12 of 25. Inherent to any threshold bump; accepted knowingly. Members who already earned gold keep it, pinned to version 1.
- **Gold thresholds remain inventory-dependent.** `docs/launch-inventory-runbook.md` sets no coverage target and every ingested lead becomes an unpublished Candidate Place awaiting moderation, so the published count at launch depends on moderation throughput. Gold at 15 is the conservative choice pending that number.
- **A member can earn several tiers in one transaction** through moderator recalculation, producing a celebration burst. The celebration surface already renders a list, so no change is needed.
- **Icelandic copy is drafted by the implementer** and needs review before merge: four collection names, three tier labels, four metric templates.
- **`is_new` is always false in the shipped RPC** and is retained unchanged rather than cleaned up in this phase.
- **The work does not split cleanly.** The schema change, both RPC signatures, the parser, the impact-page fix and the new grid are one coherent change. Every candidate seam leaves either the impact page broken or the grid rendering twelve cards in a two-column layout.

## Verification Plan

- `pnpm test:database` — new `supabase/tests/database/049_achievement_collections.test.sql` covering: twelve tier slots returned in all three states; an unstarted tier visible at current 0; a surprise definition absent while locked and present once earned; the contribution metric respecting `revoked_at` and `eligibility_started_at`; threshold monotonicity within each collection; the empty-ledger assertion raising. Updates to `016`, `023`, `038`, `039`, `040` for the dropped column and renamed keys. Run `supabase db reset` first; evaluation fixtures pollute the database.
- `pnpm test:unit` — parser cases for locked-at-zero, earned, tier versus bespoke discrimination, and removal of the two-milestone rejection. Update `achievements.test.ts`, `impact-page.test.ts`, `achievement-page.test.ts`.
- Component tests — grid renders visible gaps, the three cell states, and one progressbar per in-progress tier. Update `achievements.browser.test.ts` and `impact-record.browser.test.ts`. Note that browser tests fail in a worktree whose `node_modules` is symlinked; a real `CI=true pnpm install` is required.
- `pnpm test:e2e -- member-achievements.spec.ts` — earn a bronze through the real member flow and assert the grid, the gap and the celebration.
- Lint changed files directly rather than repo-wide: `pnpm lint` and `format:check` are red because sibling worktrees live inside the repo root and ESLint cannot resolve `tsconfigRootDir`.
- Manual: the achievements page at zero activity, mid-progress and with an earned tier, in both locales, light and dark, plus the impact page strip.

## Open Questions

- None blocking implementation.
- Deferred by decision: the real published-place count at launch, which would justify raising `explorer_places` gold to 25 through a version 2 definition.
- Unrelated and still open from earlier sessions: the `credit_spaced_places` "deliberately not a distance or speed check" question, which blocks only the Check-in verification work; the governance wording amendment owed for anonymous cohort norms; and the four clashing hardcoded pillar hues on the impact page.
