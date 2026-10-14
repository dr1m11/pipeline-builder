import { assertNever, type PipelineFileError } from '@pipeline-builder/core';

import type { ToastOptions } from '@/shared/ui/toast';

/**
 * The notification for clipboard text that could not be pasted, or null when the text is simply
 * not a pipeline (any text the user copied elsewhere), which is ignored without a word.
 */
export function pasteErrorToast(error: PipelineFileError): ToastOptions | null {
  switch (error.code) {
    case 'invalid-json':
    case 'not-a-pipeline':
      return null;
    case 'newer-version':
      return {
        tone: 'danger',
        title: 'Cannot paste nodes from a newer version',
        description: `They were copied in a newer version of the app (schema version ${String(error.version)}). Reload this tab to update it, then paste again.`,
      };
    case 'invalid-pipeline':
      return {
        tone: 'danger',
        title: 'Cannot paste a damaged pipeline',
        description: error.path === '' ? error.message : `${error.path}: ${error.message}`,
      };
    case 'duplicate-id':
      return {
        tone: 'danger',
        title: 'Cannot paste a damaged pipeline',
        description: `Two ${error.element}s have the id “${error.id}”.`,
      };
    default:
      return assertNever(error);
  }
}
