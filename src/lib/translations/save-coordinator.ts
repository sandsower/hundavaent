import { getContext, setContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export type TranslationSaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'conflict' | 'error';

const contextKey = Symbol('translation-save-coordinator');

export class TranslationSaveCoordinator {
  private readonly states = new SvelteMap<string, TranslationSaveState>();
  private readonly flushers = new Map<string, () => Promise<void>>();

  get hasUnsettled(): boolean {
    return [...this.states.values()].some((state) => state === 'unsaved' || state === 'saving');
  }

  get hasBlocking(): boolean {
    return [...this.states.values()].some(
      (state) =>
        state === 'unsaved' || state === 'saving' || state === 'conflict' || state === 'error'
    );
  }

  get problemCount(): number {
    return [...this.states.values()].filter((state) => state === 'conflict' || state === 'error')
      .length;
  }

  isEntryBlocking(key: string): boolean {
    return [...this.states.entries()].some(
      ([id, state]) =>
        id.startsWith(`${key}:`) &&
        (state === 'unsaved' || state === 'saving' || state === 'conflict' || state === 'error')
    );
  }

  register(id: string, flush: () => Promise<void>): () => void {
    this.flushers.set(id, flush);
    if (!this.states.has(id)) this.states.set(id, 'idle');
    return () => {
      const remove = () => {
        this.flushers.delete(id);
        this.states.delete(id);
      };
      const state = this.states.get(id);
      if (state === 'unsaved' || state === 'saving') {
        void flush().then(() => {
          if (this.states.get(id) !== 'conflict' && this.states.get(id) !== 'error') remove();
        });
      } else if (state !== 'conflict' && state !== 'error') {
        remove();
      }
    };
  }

  setState(id: string, state: TranslationSaveState): void {
    this.states.set(id, state);
  }

  async settle(): Promise<boolean> {
    await Promise.all([...this.flushers.values()].map((flush) => flush()));
    return !this.hasBlocking;
  }
}

export function provideTranslationSaveCoordinator(
  coordinator = new TranslationSaveCoordinator()
): TranslationSaveCoordinator {
  return setContext(contextKey, coordinator);
}

export function useTranslationSaveCoordinator(): TranslationSaveCoordinator {
  return (
    getContext<TranslationSaveCoordinator | undefined>(contextKey) ??
    new TranslationSaveCoordinator()
  );
}
