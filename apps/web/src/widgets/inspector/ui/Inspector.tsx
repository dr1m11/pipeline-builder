import {
  EMPTY_ISSUES,
  findNode,
  NODE_DEFINITIONS,
  type PipelineNode,
} from '@pipeline-builder/core';
import { useCallback, useId, useState } from 'react';

import { NodeKindIcon } from '@/entities/node';
import { usePipelineStore, useValidationReport } from '@/entities/pipeline';
import { NodeProperties } from '@/features/edit-node-properties';
import { type FieldRevealRequest, ProblemList } from '@/features/review-problems';

import { ProblemsSection } from './ProblemsSection';

/**
 * The editor's right sidebar: the properties of the selected node and the problems of the
 * pipeline. Picking a field problem selects its node and focuses the field in the form.
 */
export function Inspector() {
  // A field to focus once its node's form is shown; cleared as soon as it has been focused, so
  // selecting the node again later does not move focus.
  const [fieldRequest, setFieldRequest] = useState<FieldRevealRequest | null>(null);
  const clearFieldRequest = useCallback(() => {
    setFieldRequest(null);
  }, []);

  return (
    <div className="flex flex-col">
      <PropertiesSection fieldRequest={fieldRequest} onFieldFocused={clearFieldRequest} />
      <ProblemsSection onRevealField={setFieldRequest} />
    </div>
  );
}

interface PropertiesSectionProps {
  fieldRequest: FieldRevealRequest | null;
  onFieldFocused: () => void;
}

function PropertiesSection({ fieldRequest, onFieldFocused }: PropertiesSectionProps) {
  const headingId = useId();
  const selectedCount = usePipelineStore((state) => state.selectedNodeIds.size);
  // The node object is stable while it is unchanged, so this re-renders only when it changes.
  const node = usePipelineStore((state) => {
    if (state.selectedNodeIds.size !== 1) return undefined;
    const [id] = state.selectedNodeIds;
    return id === undefined ? undefined : findNode(state.pipeline, id);
  });

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 p-3">
      <h2 id={headingId} className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Properties
      </h2>
      {node === undefined ? (
        <p className="text-sm text-fg-muted">
          {selectedCount > 1
            ? `${String(selectedCount)} nodes are selected. Select one to edit its properties.`
            : 'Select a node to edit its properties.'}
        </p>
      ) : (
        <>
          <NodeHeader node={node} />
          <NodeGraphProblems node={node} />
          <NodeProperties
            key={node.id}
            node={node}
            focusField={fieldRequest?.nodeId === node.id ? fieldRequest.field : undefined}
            onFieldFocused={onFieldFocused}
          />
        </>
      )}
    </section>
  );
}

function NodeHeader({ node }: { node: PipelineNode }) {
  const { title, description } = NODE_DEFINITIONS[node.kind];
  return (
    <div className="flex items-start gap-2.5">
      <NodeKindIcon kind={node.kind} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="truncate text-sm font-semibold">{node.label}</h3>
        <p className="text-xs text-fg-muted">
          {title} · {description}
        </p>
      </div>
    </div>
  );
}

/**
 * Problems of the node beyond its fields (unconnected inputs, broken edges, cycles, an unused
 * result); the form shows field problems next to their fields.
 */
function NodeGraphProblems({ node }: { node: PipelineNode }) {
  const issues = (useValidationReport().byNode.get(node.id) ?? EMPTY_ISSUES).filter(
    (issue) => issue.code !== 'invalid-field',
  );
  if (issues.length === 0) return null;
  return <ProblemList issues={issues} label={`Problems of ${node.label}`} />;
}
