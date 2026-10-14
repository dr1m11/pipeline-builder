import type { LlmProvider } from '@pipeline-builder/core';
import { useSyncExternalStore } from 'react';

import { getApiKey, subscribeToApiKeys } from '../api/api-key-storage';

function getServerSnapshot(): null {
  return null;
}

/**
 * The API key of `provider`, or null when none is saved; the component renders again when the key
 * is saved or cleared in this tab, or when another tab changes a key remembered on this device.
 * Use `getApiKey` outside React, such as while a pipeline runs.
 */
export function useApiKey(provider: LlmProvider): string | null {
  return useSyncExternalStore(subscribeToApiKeys, () => getApiKey(provider), getServerSnapshot);
}
