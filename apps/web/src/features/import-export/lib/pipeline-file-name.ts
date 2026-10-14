/** Extension of exported pipeline files; the part before it is the pipeline's name. */
const PIPELINE_FILE_EXTENSION = '.pipeline.json';

const FALLBACK_NAME = 'pipeline';
// Characters that Windows, macOS or Linux do not allow in a file name, and control characters.
const UNSAFE_CHARACTERS = /[<>:"/\\|?*\p{Cc}]/gu;

/**
 * The name to export a pipeline as: `<pipeline name>.pipeline.json`. Runs of white space (tabs,
 * line breaks) become one space, characters a file system would refuse become dashes, and leading
 * or trailing dots and spaces are dropped (hidden files on Unix, refused on Windows). A name with
 * nothing left falls back to "pipeline". Browsers sanitize download names further, e.g. names
 * reserved on Windows.
 */
export function pipelineFileName(pipelineName: string): string {
  const base = pipelineName
    .replace(/\s+/g, ' ')
    .replace(UNSAFE_CHARACTERS, '-')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  return `${base === '' ? FALLBACK_NAME : base}${PIPELINE_FILE_EXTENSION}`;
}
