/**
 * Decides whether a client-side navigation should run inside a view transition.
 *
 * The decision is pure so it can be tested away from the SvelteKit lifecycle: the layout feeds
 * it the route ids, the reduced-motion state, and whether `document.startViewTransition`
 * exists. Moderation is excluded in both directions - every queue tab and work item there is a
 * real navigation, and a crossfade per click is choreography in a work-a-queue surface, the
 * same reasoning that zeroes `--hv-motion-celebrate` for operations.
 */
export interface ViewTransitionContext {
  fromRouteId: string | null;
  toRouteId: string | null;
  prefersReducedMotion: boolean;
  supported: boolean;
}

const moderationRoutePrefix = '/[lang=lang]/moderation';

export function shouldViewTransition(context: ViewTransitionContext): boolean {
  if (!context.supported || context.prefersReducedMotion) return false;
  if (context.fromRouteId === null || context.toRouteId === null) return false;
  return (
    !context.fromRouteId.startsWith(moderationRoutePrefix) &&
    !context.toRouteId.startsWith(moderationRoutePrefix)
  );
}
