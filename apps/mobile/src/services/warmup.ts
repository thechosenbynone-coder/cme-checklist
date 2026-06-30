import { getBaseUrl } from './api';

// Dispara o acordar do backend (API + banco) uma única vez por sessão do
// app, não importa quantas telas chamem warmupBackend() — todas reaproveitam
// a mesma promise em voo.
let warmupPromise: Promise<void> | null = null;

export function warmupBackend(): Promise<void> {
  if (!warmupPromise) {
    const baseUrl = getBaseUrl();
    warmupPromise = baseUrl
      ? fetch(`${baseUrl}/ready`).then(() => undefined).catch(() => undefined)
      : Promise.resolve();
  }
  return warmupPromise;
}
