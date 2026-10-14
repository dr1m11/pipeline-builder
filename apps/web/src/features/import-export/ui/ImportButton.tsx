import { Upload } from 'lucide-react';
import { useRef } from 'react';

import { IconButton } from '@/shared/ui/icon-button';

import { useImportPipeline } from '../model/use-import-pipeline';

/**
 * Opens the file picker and imports the chosen pipeline file into the surrounding pipeline, as
 * one undoable step; a toast says how it went. Needs `ToastProvider` above it.
 */
export function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const importPipeline = useImportPipeline();

  return (
    <>
      <IconButton
        label="Import pipeline"
        onClick={() => {
          inputRef.current?.click();
        }}
      >
        <Upload aria-hidden />
      </IconButton>
      {/* The button stands in for it; the label is a handle for tests and automation. */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        aria-label="Pipeline file"
        hidden
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.item(0) ?? null;
          // Cleared, so that choosing the same file again imports it again.
          input.value = '';
          if (file !== null) void importPipeline(file);
        }}
      />
    </>
  );
}
