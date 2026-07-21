import type { MessageKey } from './is';
import messages from './messages/en.json';

export const enCatalogue = messages satisfies Record<MessageKey, string>;
