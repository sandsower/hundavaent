/**
 * Decides whether a client-side navigation should run inside a view transition.
 *
 * The decision is pure so it can be tested away from the SvelteKit lifecycle: the layout feeds
 * it the route ids, the reduced-motion state, and whether `document.startViewTransition`
 * exists. Operations surfaces are excluded in both directions - every queue tab and work item
 * there is a real navigation, and a crossfade per click is choreography in a work-a-queue
 * surface, the same reasoning that zeroes `--hv-motion-celebrate` for operations. The
 * translations workspace is listed even though its own internal navigations never reach this
 * hook (it lives outside the [lang=lang] layout), so the crossing navigation stays quiet too.
 */
export interface ViewTransitionContext {
  fromRouteId: string | null;
  toRouteId: string | null;
  prefersReducedMotion: boolean;
  supported: boolean;
}

const operationsRoutePrefixes: readonly string[] = ['/[lang=lang]/moderation', '/translations'];

export function shouldViewTransition(context: ViewTransitionContext): boolean {
  if (!context.supported || context.prefersReducedMotion) return false;
  const { fromRouteId, toRouteId } = context;
  if (fromRouteId === null || toRouteId === null) return false;
  return !operationsRoutePrefixes.some(
    (prefix) => fromRouteId.startsWith(prefix) || toRouteId.startsWith(prefix)
  );
}
