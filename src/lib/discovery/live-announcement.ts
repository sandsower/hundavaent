import { tick } from 'svelte';

/**
 * Wraps a polite live region's setter in the one rule that makes it work.
 *
 * Assigning the identical string is not a state change, so a screen reader is told nothing when
 * the same outcome happens twice. A retry that fails the same way, or a second Correction sent
 * from the same panel, is a separate event and has to be announced as one. Clearing the region and
 * letting the DOM settle before writing the message again is what turns a repeat into a change.
 *
 * The rule lives here rather than in each panel because two copies of it are two chances for one
 * of them to quietly stop clearing, and the failure is silent by definition: nothing is announced,
 * and nothing looks wrong.
 *
 * The caller keeps the reactive string and renders it; only the sequencing belongs here.
 */
export function createLiveAnnouncer(write: (message: string) => void): (message: string) => void {
  let current = '';

  return (message: string): void => {
    void (async () => {
      if (current === message) {
        current = '';
        write('');
        await tick();
      }
      current = message;
      write(message);
    })();
  };
}
