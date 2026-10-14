import {
  assertNever,
  type ParsedPipelineFile,
  type PipelineFileError,
} from '@pipeline-builder/core';

/** Why a chosen file was not imported: its text is not a pipeline, or it could not be read. */
export type ImportFailure = PipelineFileError | { readonly code: 'unreadable' };

/** What a toast says about an import. */
export interface ImportMessage {
  readonly title: string;
  readonly description?: string;
}

/**
 * The toast for a file that was imported: the pipeline's name, and whether loading it updated an
 * older file or removed connections the editor could not keep (see docs/adr/0010).
 */
export function describeImportSuccess({
  pipeline,
  migratedFrom,
  repairs,
}: ParsedPipelineFile): ImportMessage {
  const notes: string[] = [];
  if (migratedFrom !== null) notes.push(`Updated from schema version ${String(migratedFrom)}.`);
  if (repairs.length === 1) {
    notes.push('1 connection that pointed at a missing node or an occupied input was removed.');
  } else if (repairs.length > 1) {
    notes.push(
      `${String(repairs.length)} connections that pointed at missing nodes or occupied inputs were removed.`,
    );
  }
  const title = `Imported “${pipeline.name}”`;
  return notes.length === 0 ? { title } : { title, description: notes.join(' ') };
}

/** The toast for a file that could not be imported: which file, and why in plain words. */
export function describeImportFailure(fileName: string, failure: ImportFailure): ImportMessage {
  return { title: `Couldn’t import “${fileName}”`, description: failureReason(failure) };
}

function failureReason(failure: ImportFailure): string {
  switch (failure.code) {
    case 'unreadable':
      return 'The file could not be read.';
    case 'invalid-json':
      return 'The file is not valid JSON.';
    case 'not-a-pipeline':
      return 'It is not a Pipeline Builder file.';
    case 'newer-version':
      return `It was saved by a newer version of Pipeline Builder (schema version ${String(failure.version)}). Reload the page to update the app.`;
    case 'invalid-pipeline':
      return failure.path === ''
        ? `The pipeline is invalid: ${sentence(failure.message)}`
        : `The pipeline is invalid at ${failure.path}: ${sentence(failure.message)}`;
    case 'duplicate-id':
      return `The id “${failure.id}” is used by two ${failure.element === 'node' ? 'nodes' : 'edges'}.`;
    default:
      return assertNever(failure);
  }
}

/** `text` ending with a full stop, unless it already ends with punctuation. */
function sentence(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
