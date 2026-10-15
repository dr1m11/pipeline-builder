import type { JsonValue } from '@pipeline-builder/core';

import { formatRunValue } from '../lib/describe-node-run';
import type { NodeRunState } from '../model/run-state';
import { useNodeRun } from '../model/store-context';

export interface NodeRunPreviewProps {
  nodeId: string;
  /**
   * The output whose value the card shows: an LLM Call's `response`, streamed as it comes, or an
   * Output's `value`. Without it, the card shows only why the node failed.
   */
  port?: string | undefined;
  /** Names the text for assistive technology: "Model response". */
  label: string;
}

/**
 * What the node `nodeId` produced in the run, for its card: the last lines of its text, kept as
 * written (line breaks, indentation) and scrollable; or why it failed. Nothing while there is
 * nothing to show. It re-renders with every token the node streams, and only then.
 *
 * The text stays scrolled to its end as it grows. It is a read-only text field that takes focus,
 * so the keyboard scrolls it too; it is marked `nokey` and `nowheel`, so arrow keys and the wheel
 * scroll it rather than move the node or zoom the canvas.
 */
export function NodeRunPreview({ nodeId, port, label }: NodeRunPreviewProps) {
  const run = useNodeRun(nodeId);
  if (run.status === 'error' && run.error !== undefined) {
    return (
      <p className="border-t border-border px-3 py-1.5 text-xs text-danger">{run.error.message}</p>
    );
  }
  const text = port === undefined ? '' : previewText(run, port);
  if (text === '') return null;
  return (
    // A read-only text field, which keyboard users can focus to scroll and read. A column in
    // reverse order starts scrolled to its end and stays there as the text grows.
    <div
      role="textbox"
      aria-readonly
      aria-multiline
      aria-label={label}
      tabIndex={0}
      className="nokey nowheel flex max-h-32 flex-col-reverse overflow-y-auto border-t border-border px-3 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
    >
      <pre className="font-mono text-xs break-words whitespace-pre-wrap">{text}</pre>
    </div>
  );
}

/** The value of `port` once the node has it, and the text streamed so far before that. */
function previewText({ text, outputs }: NodeRunState, port: string): string {
  const value = outputValue(outputs, port);
  return value === undefined ? text : formatRunValue(value);
}

function outputValue(outputs: NodeRunState['outputs'], port: string): JsonValue | undefined {
  return outputs !== undefined && Object.hasOwn(outputs, port) ? outputs[port] : undefined;
}
