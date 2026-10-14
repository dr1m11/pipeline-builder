/** A text file to hand to the browser's downloads. */
export interface DownloadableFile {
  readonly name: string;
  readonly text: string;
  /** Media type, e.g. `application/json`. */
  readonly type: string;
}

/**
 * Saves `file` through the browser's downloads, as a click on a link to it would: a temporary
 * `<a download>` pointing at an object URL of the text.
 */
export function downloadFile({ name, text, type }: DownloadableFile): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Released after the click has been handled: some browsers read the URL only then.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
