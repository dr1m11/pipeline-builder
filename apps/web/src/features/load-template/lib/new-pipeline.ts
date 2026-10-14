import {
  createEmptyPipeline,
  instantiateFragment,
  type Pipeline,
  type PipelineTemplate,
} from '@pipeline-builder/core';

/** Name of a blank pipeline, as of the one the editor starts with. */
export const BLANK_PIPELINE_NAME = 'Untitled pipeline';

/**
 * A new pipeline made from `template`, named after it. The pipeline, its nodes and its edges get
 * fresh ids from `createId`, so it is a document of its own however often the template is used.
 */
export function pipelineFromTemplate(template: PipelineTemplate, createId: () => string): Pipeline {
  const pipeline = createEmptyPipeline({ id: createId(), name: template.name });
  const { nodes, edges } = instantiateFragment(template.pipeline, pipeline, {
    createId,
    offset: { x: 0, y: 0 },
  });
  return { ...pipeline, nodes, edges };
}

/** A new blank pipeline with an id from `createId`. */
export function blankPipeline(createId: () => string): Pipeline {
  return createEmptyPipeline({ id: createId(), name: BLANK_PIPELINE_NAME });
}

/** Whether `pipeline` is already what `blankPipeline` would make, apart from its id. */
export function isBlankPipeline(pipeline: Pipeline): boolean {
  return pipeline.nodes.length === 0 && pipeline.name === BLANK_PIPELINE_NAME;
}
