import {
  type Pipeline,
  PIPELINE_TEMPLATES,
  type PipelineNode,
  type PipelineTemplate,
  validatePipeline,
} from '@pipeline-builder/core';
import { describe, expect, it } from 'vitest';

import { pipelineFromTemplate } from './new-pipeline';

/** An id generator that counts: "id-1", "id-2"… */
function counter(): () => string {
  let last = 0;
  return () => `id-${String(++last)}`;
}

function firstTemplate(): PipelineTemplate {
  const [template] = PIPELINE_TEMPLATES;
  if (template === undefined) throw new Error('There are no templates');
  return template;
}

/** The ids of a pipeline, its nodes and its edges. */
function idsOf(pipeline: Pipeline): string[] {
  return [
    pipeline.id,
    ...pipeline.nodes.map(({ id }) => id),
    ...pipeline.edges.map(({ id }) => id),
  ];
}

/** Each edge as "source label.port → target label.port". */
function connections(pipeline: Pipeline): string[] {
  const label = (id: string) => pipeline.nodes.find((node) => node.id === id)?.label ?? id;
  return pipeline.edges.map(
    (edge) => `${label(edge.source)}.${edge.sourcePort} → ${label(edge.target)}.${edge.targetPort}`,
  );
}

describe('pipelineFromTemplate', () => {
  it.each(PIPELINE_TEMPLATES)('makes $name with fresh ids and the same graph', (template) => {
    const pipeline = pipelineFromTemplate(template, counter());

    expect(pipeline.name).toBe(template.name);
    expect(idsOf(pipeline)).toEqual(
      idsOf(template.pipeline).map((_, index) => `id-${String(index + 1)}`),
    );
    const content = ({ kind, label, position, data }: PipelineNode) => ({
      kind,
      label,
      position,
      data,
    });
    expect(pipeline.nodes.map(content)).toEqual(template.pipeline.nodes.map(content));
    expect(connections(pipeline)).toEqual(connections(template.pipeline));
    expect(validatePipeline(pipeline).issues).toEqual([]);
  });

  it('makes a different document each time', () => {
    const createId = counter();
    const template = firstTemplate();

    const first = pipelineFromTemplate(template, createId);
    const second = pipelineFromTemplate(template, createId);

    expect(idsOf(second).filter((id) => idsOf(first).includes(id))).toEqual([]);
  });
});
