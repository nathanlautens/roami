import { createSignal } from './signal';

/** A tiny signal: the send screen fires it, the home screen plays the celebration. */
export type Sent = { id: number; what: string; count: number; title?: string; line?: string };

const current = createSignal<Sent | null>(null);
let nextId = 1;

export function celebrateSent(sent: Omit<Sent, 'id'>) {
  current.set({ ...sent, id: nextId++ });
}

export function clearCelebration() {
  current.set(null);
}

export const useCelebration = current.use;
