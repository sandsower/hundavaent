# Hundavænt Visual North Star

## Status

- Design status: approved.
- Approved direction: `Hundavænt place companion`.
- Implementation approach: one semantic system adopted through complete vertical slices.
- Current implementation slice: Phase 2 public Place journey.

## Purpose

This document is the canonical visual-system record for the public Hundavænt repository.
It describes the stable design contract rather than a particular mockup or generated screenshot.
Generated evaluation evidence proves the contract against the running product and is not committed to the repository.

## Direction

The product blends 70 percent everyday place guide, 20 percent Icelandic wayfinding, and 10 percent Nordic companion.
It should feel calm, trustworthy, distinctly Icelandic, and equally natural for indoor and outdoor places.

- Everyday place guide supplies editorial hierarchy, disciplined geometry, cartographic calm, and factual place information.
- Icelandic wayfinding makes dog-access states, selection, verification, and action priorities unmistakable.
- Nordic companion supplies warmth through humane copy and real place imagery where the product already has approved media.

## Reference Palette

| Role          | Reference value | Semantic use                                            |
| ------------- | --------------- | ------------------------------------------------------- |
| Snow          | `#f2f5f1`       | Page ground and quiet surfaces                          |
| Basalt        | `#1e2d31`       | Text, strong boundaries, and high-emphasis controls     |
| Moss          | `#58705b`       | Natural supporting emphasis                             |
| Fjord         | `#2f6f86`       | Navigation, links, focus, location, and information     |
| Signal Yellow | `#f2c94c`       | Verified access truth, selection, and committed actions |

Signal Yellow is scarce and semantic.
It must not become a decorative background or a general brand fill.
Accessible derived tints and danger or success colors may extend this palette while retaining consistent product-wide meanings.

## Typography

Source Serif 4 names places and major destinations with a calm editorial voice.
Inter remains the operational face for controls, evidence, metadata, forms, maps, and dense moderation content.
Both fonts are bundled and tested so rendering does not depend on the browser host.

## One System, Two Modes

### Place Mode

Place mode governs public discovery, Place Profiles, Member surfaces, and Contribution journeys.
It is spacious, editorial, cartographic, and image-led when approved real imagery is available.

### Operations Mode

Operations mode governs the compact moderation workspace and authorized fallback routes.
It uses denser spacing while preserving the same type roles, controls, focus treatment, surfaces, and status meanings.

Density may change between modes.
Semantic meaning may not.

## Visual Ownership

`src/lib/design-system/tokens.css` owns the semantic color, typography, spacing, shape, elevation, motion, and focus contract.
`src/lib/design-system/primitives.css` owns the focused surface, control, field, eyebrow, and status primitives.
Feature modules own layout and exceptional composition without introducing new brand meanings.

Legacy visual variables remain available only as a migration bridge for surfaces outside the current vertical slice.
They should be removed after the later migration phases eliminate their remaining callers.

## Phase 1 Walking Skeleton - Delivered

The public proof is a complete directory results state with search, filters, indoor and outdoor Place results, accessible verified-access cues, and synchronized map markers.
The operations proof is a complete Suggestions workspace state with queue selection, item selection, evidence review, and the sticky decision dock.

The Phase 1 migration must not change discovery URL state, map synchronization, filtering, fallback behavior, moderation authorization, action contracts, server-confirmed continuation, retained failure state, focus restoration, or fallback routes.

Phase 1 is delivered in production and remains the baseline for later vertical slices.

## Phase 2 Public Place Journey

Phase 2 extends Place mode through the complete selected Place Profile without changing discovery URL state, focus restoration, history behavior, server contracts, or authorization.
The selected profile uses editorial place hierarchy, a clear welcome and access verdict, structured access conditions and evidence, image-led approved media, and an informational Dog-Friendliness evidence panel.
Favourite controls expose idle, busy, selected, and error states through text, accessible state, and semantic styling.
Check-in controls expose idle, busy, committed, and error states through text, live regions, accessible state, and semantic styling.
Candidate and inactive public Place status routes use the same Place mode and status-panel primitives while preserving their distinct bilingual explanations.
Signal Yellow remains reserved for verified access, selection, and committed actions.

## Evidence Contract

`pnpm test:visual` writes named bilingual desktop and mobile captures under `test-results/visual/screenshots/`.
`pnpm test:a11y` proves keyboard operation, focus, semantic structure, long-copy reflow, and serious WCAG violation absence.
`pnpm eval:release` records screenshots and accessibility results in the clean-evaluation manifest under `test-results/evaluation/`.
These paths are generated and ignored by Git.

Required Phase 1 evidence includes:

- English and Icelandic discovery results at desktop and mobile viewports.
- Indoor and outdoor Place contexts in the same discovery state.
- Suggestions workspace default, selected, success, error, conflict, empty, long-content, mobile, and 200-percent-zoom states.
- Visible keyboard focus, non-color selection cues, no horizontal page overflow, and reduced-motion compatibility.

Required Phase 2 evidence includes:

- English and Icelandic selected Place Profiles at desktop and mobile viewports.
- Expanded access conditions, verification state, source provenance, and approved media gallery states.
- A selected Dog-Friendliness evidence panel with eligible-count, recency, dimension, and overall-result semantics when public evidence exists.
- Selected Favourite and committed Check-in states on the selected Place Profile after server-confirmed mutations.
- English and Icelandic under-review and inactive public Place status panels in Place mode.
- Keyboard operation, live-region semantics, non-color state cues, Axe-clean output, and no horizontal page overflow across these states.

## Anti-Patterns

- Decorative Signal Yellow.
- Organic blobs, playful rotation, novelty offset shadows, and irregular geometry.
- Outdoors-only framing that makes indoor Places secondary.
- Public and moderation modes that assign different meanings to the same status.
- Dense operations UI that abandons hierarchy or readable type.
- Page-by-page recoloring without shared semantic ownership.
- Big-bang migration that expands the regression surface.

## Source Record

- Approved desktop reference SHA-256: `7173e4c9aa9c5ca1e9143ff657c21b90d663dd611f8c6f57229c215929c2bb74`.
- Approved mobile reference SHA-256: `c51819a0572523db649fb1cc9d0a494a23776d200b2b567672267f5ca47efbd8`.
- Approved moderation behavior is represented by the shipped compact moderation workspace and its automated tests.
- Temporary visual-exploration markup and images are reference evidence only and are intentionally not copied into this repository.
