import { createSignal } from './signal';

/** Whether the Face ID / fingerprint cover is showing, so pop-ups can wait until you're in. */
const locked = createSignal(false);

export const setAppLocked = locked.set;
export const useAppLocked = locked.use;
