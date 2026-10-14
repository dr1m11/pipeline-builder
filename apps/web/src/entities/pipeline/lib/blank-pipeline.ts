import { createEmptyPipeline, type Pipeline } from '@pipeline-builder/core';

/** Name of a pipeline the editor starts with, before the user loads or names one. */
const BLANK_PIPELINE_NAME = 'Untitled pipeline';

/** A new empty pipeline with the default name ("Untitled pipeline"); the caller supplies the id. */
export function createBlankPipeline(id: string): Pipeline {
  return createEmptyPipeline({ id, name: BLANK_PIPELINE_NAME });
}

/** Whether `pipeline` is what `createBlankPipeline` makes, whatever its id. */
export function isBlankPipeline(pipeline: Pipeline): boolean {
  return (
    pipeline.nodes.length === 0 &&
    pipeline.edges.length === 0 &&
    pipeline.name === BLANK_PIPELINE_NAME
  );
}
