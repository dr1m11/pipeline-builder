import type { Position } from '../geometry';
import {
  NODE_DEFINITIONS,
  type NodeDataMap,
  type NodeKind,
  type NodeOfKind,
  type PipelineNode,
} from '../nodes/registry';
import { createEmptyPipeline, type Pipeline, type PipelineEdge } from '../pipeline';

/** Identifier of a built-in pipeline template. */
export type PipelineTemplateId = 'ask-a-question' | 'route-by-sentiment' | 'extract-a-json-field';

/** A ready-made pipeline to start from. */
export interface PipelineTemplate {
  readonly id: PipelineTemplateId;
  /** Shown in the UI and given to the pipeline made from it ("Ask a question"). */
  readonly name: string;
  /** A short phrase about what the pipeline does, shown next to the name. */
  readonly description: string;
  /**
   * The pipeline itself: valid, with an id and name of its own and readable node labels, laid out
   * left to right. Load it with fresh ids (`instantiateFragment`), as a new document.
   */
  readonly pipeline: Pipeline;
}

// Cards are 240px wide; a column leaves a short edge between two of them, so that a whole template
// still fits a narrow canvas.
const COLUMN_WIDTH = 300;
// Branches sit this far above and below the row they leave.
const BRANCH_OFFSET = 100;

/** The top left corner of a card in `column`, `offset` pixels below the main row. */
function at(column: number, offset = 0): Position {
  return { x: column * COLUMN_WIDTH, y: offset };
}

/**
 * A node with the default data of its kind and `data` over it, so a field added to a kind later
 * gets its default in every template.
 */
function templateNode<K extends NodeKind>(
  kind: K,
  params: {
    readonly id: string;
    readonly label: string;
    readonly position: Position;
    readonly data?: Partial<NodeDataMap[K]>;
  },
): NodeOfKind<K> {
  const { id, label, position, data = {} } = params;
  return { id, kind, label, position, data: { ...NODE_DEFINITIONS[kind].createData(), ...data } };
}

/** An edge from `source`'s output to `target`'s input, named after its nodes. */
function edge(
  source: PipelineNode,
  sourcePort: string,
  target: PipelineNode,
  targetPort: string,
): PipelineEdge {
  return {
    id: `${source.id}-${target.id}`,
    source: source.id,
    sourcePort,
    target: target.id,
    targetPort,
  };
}

function template(
  { id, name, description }: Omit<PipelineTemplate, 'pipeline'>,
  nodes: readonly PipelineNode[],
  edges: readonly PipelineEdge[],
): PipelineTemplate {
  return {
    id,
    name,
    description,
    pipeline: { ...createEmptyPipeline({ id, name }), nodes, edges },
  };
}

/** Input → Prompt → LLM Call → Output. */
function askAQuestion(): PipelineTemplate {
  const question = templateNode('input', {
    id: 'question',
    label: 'Question',
    position: at(0),
    data: { valueType: 'text', value: 'Why is the sky blue?' },
  });
  const prompt = templateNode('prompt', {
    id: 'prompt',
    label: 'Answer prompt',
    position: at(1),
    data: { template: 'Answer the question: {{question}}' },
  });
  const model = templateNode('llm-call', { id: 'model', label: 'Model', position: at(2) });
  const answer = templateNode('output', {
    id: 'answer',
    label: 'Answer',
    position: at(3),
    data: { format: 'markdown' },
  });
  return template(
    {
      id: 'ask-a-question',
      name: 'Ask a question',
      description: 'An LLM answers a question',
    },
    [question, prompt, model, answer],
    [
      edge(question, 'value', prompt, 'question'),
      edge(prompt, 'prompt', model, 'prompt'),
      edge(model, 'response', answer, 'value'),
    ],
  );
}

/** Input → Prompt → LLM Call → Condition, which sends the answer to one of two Outputs. */
function routeBySentiment(): PipelineTemplate {
  const review = templateNode('input', {
    id: 'review',
    label: 'Review',
    position: at(0),
    data: {
      valueType: 'text',
      value: 'The headphones arrived a day early, and they sound great.',
    },
  });
  const prompt = templateNode('prompt', {
    id: 'prompt',
    label: 'Sentiment prompt',
    position: at(1),
    data: {
      template:
        'Is this review positive or negative? Answer with one lowercase word: positive or negative.\n\nReview: {{review}}',
    },
  });
  const classifier = templateNode('llm-call', {
    id: 'classifier',
    label: 'Classifier',
    position: at(2),
    data: { temperature: 0, maxTokens: 16 },
  });
  const check = templateNode('condition', {
    id: 'is-positive',
    label: 'Is positive?',
    position: at(3),
    data: { operator: 'contains', operand: 'positive' },
  });
  const positive = templateNode('output', {
    id: 'positive',
    label: 'Positive',
    position: at(4, -BRANCH_OFFSET),
  });
  const negative = templateNode('output', {
    id: 'negative',
    label: 'Negative',
    position: at(4, BRANCH_OFFSET),
  });
  return template(
    {
      id: 'route-by-sentiment',
      name: 'Route by sentiment',
      description: 'Branches on a review’s sentiment',
    },
    [review, prompt, classifier, check, positive, negative],
    [
      edge(review, 'value', prompt, 'review'),
      edge(prompt, 'prompt', classifier, 'prompt'),
      edge(classifier, 'response', check, 'value'),
      edge(check, 'true', positive, 'value'),
      edge(check, 'false', negative, 'value'),
    ],
  );
}

/** Input → Prompt → LLM Call → Transform (parse JSON) → Transform (get a field) → Output. */
function extractAJsonField(): PipelineTemplate {
  const text = templateNode('input', {
    id: 'text',
    label: 'Text',
    position: at(0),
    data: {
      valueType: 'text',
      value: 'Hi, I’m Ada Lovelace. Write to me at ada@example.com about the engine.',
    },
  });
  const prompt = templateNode('prompt', {
    id: 'prompt',
    label: 'Extraction prompt',
    position: at(1),
    data: {
      template:
        'Find the name and email of the person in this text. Answer with a JSON object only, with the fields "name" and "email".\n\nText: {{text}}',
    },
  });
  const extractor = templateNode('llm-call', {
    id: 'extractor',
    label: 'Extractor',
    position: at(2),
    data: { temperature: 0 },
  });
  const parse = templateNode('transform', {
    id: 'parse',
    label: 'Parse JSON',
    position: at(3),
    data: { operation: 'parse-json' },
  });
  const getEmail = templateNode('transform', {
    id: 'get-email',
    label: 'Get email',
    position: at(4),
    data: { operation: 'get-field', path: 'email' },
  });
  const email = templateNode('output', { id: 'email', label: 'Email', position: at(5) });
  return template(
    {
      id: 'extract-a-json-field',
      name: 'Extract a JSON field',
      description: 'Reads one field from an LLM’s JSON',
    },
    [text, prompt, extractor, parse, getEmail, email],
    [
      edge(text, 'value', prompt, 'text'),
      edge(prompt, 'prompt', extractor, 'prompt'),
      edge(extractor, 'response', parse, 'value'),
      edge(parse, 'result', getEmail, 'value'),
      edge(getEmail, 'result', email, 'value'),
    ],
  );
}

/**
 * The built-in templates, in menu order: "Ask a question", "Route by sentiment" (a Condition with
 * two Outputs) and "Extract a JSON field" (two Transforms). Each pipeline has no validation errors
 * or warnings and survives a pipeline file round trip unchanged.
 */
export const PIPELINE_TEMPLATES: readonly PipelineTemplate[] = [
  askAQuestion(),
  routeBySentiment(),
  extractAJsonField(),
];
