import {
  createEmptyPipeline,
  instantiateFragment,
  type Pipeline,
  type PipelineTemplate,
} from '@pipeline-builder/core';

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
