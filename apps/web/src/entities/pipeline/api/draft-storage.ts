import {
  err,
  ok,
  type ParsedPipelineFile,
  parsePipelineFile,
  type Pipeline,
  type PipelineFileError,
  type Result,
  serializePipeline,
} from '@pipeline-builder/core';

/** Where the draft is kept: the pipeline being edited, as the text of a pipeline file. */
export const DRAFT_STORAGE_KEY = 'pb:pipeline';
/**
 * Where the saved text of a draft that could not be restored as it was (unreadable, or repaired)
 * is kept, so that the next save does not erase it. It holds the latest such draft only.
 */
export const UNREADABLE_DRAFT_STORAGE_KEY = 'pb:pipeline:unreadable';

/** What was found under the draft key. */
export type DraftLoadResult =
  /** Nothing is saved, or the browser does not give access to storage. */
  | { readonly status: 'empty' }
  /**
   * The saved pipeline, with what was done to load it (see `parsePipelineFile`). When edges had to
   * be dropped (`repairs`), the next save would lose them for good, so the saved text is copied to
   * `UNREADABLE_DRAFT_STORAGE_KEY` too; `backedUp` tells whether that copy was made.
   */
  | ({ readonly status: 'restored'; readonly backedUp: boolean } & ParsedPipelineFile)
  /**
   * The saved text is not a pipeline this app can read. When `backedUp`, it was moved to
   * `UNREADABLE_DRAFT_STORAGE_KEY`; otherwise it could not be copied and the next save replaces it.
   */
  | {
      readonly status: 'unreadable';
      readonly error: PipelineFileError;
      readonly backedUp: boolean;
    };

/** Why the draft was not saved: storage is full, or the browser does not allow storage at all. */
export type DraftSaveError = 'quota-exceeded' | 'unavailable';

const EMPTY: DraftLoadResult = { status: 'empty' };

/**
 * Reads the draft from `storage` (`localStorage` by default; null when it is unavailable). A draft
 * that cannot be read is moved to `UNREADABLE_DRAFT_STORAGE_KEY`, and a draft that loads only with
 * repairs is copied there, replacing an earlier one, so that nothing saved is overwritten without
 * the user being told.
 */
export function loadDraft(storage: Storage | null = getLocalStorage()): DraftLoadResult {
  if (storage === null) return EMPTY;
  let text: string | null;
  try {
    text = storage.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (text === null) return EMPTY;

  const parsed = parsePipelineFile(text);
  if (!parsed.ok) {
    return { status: 'unreadable', error: parsed.error, backedUp: setAside(storage, text) };
  }
  const backedUp = parsed.value.repairs.length > 0 && backUp(storage, text);
  return { status: 'restored', ...parsed.value, backedUp };
}

/** Saves `pipeline` as the draft in `storage` (`localStorage` by default; null when unavailable). */
export function saveDraft(
  pipeline: Pipeline,
  storage: Storage | null = getLocalStorage(),
): Result<void, DraftSaveError> {
  if (storage === null) return err('unavailable');
  try {
    storage.setItem(DRAFT_STORAGE_KEY, serializePipeline(pipeline));
    return ok(undefined);
  } catch (error) {
    return err(isQuotaExceeded(error) ? 'quota-exceeded' : 'unavailable');
  }
}

/** `localStorage`, or null when reading the property throws (some privacy settings make it). */
function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Copies the text of a draft to the backup key; false if it cannot. */
function backUp(storage: Storage, text: string): boolean {
  try {
    storage.setItem(UNREADABLE_DRAFT_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

/** Copies an unreadable draft to the backup key and frees the draft key; false if it cannot copy. */
function setAside(storage: Storage, text: string): boolean {
  if (!backUp(storage, text)) return false;
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // The copy is kept, and the next save replaces the draft anyway.
  }
  return true;
}

function isQuotaExceeded(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'QuotaExceededError';
}
