import messages from './messages/is.json' with { type: 'json' };

export const isCatalogue = messages;

export type MessageKey = keyof typeof isCatalogue;
