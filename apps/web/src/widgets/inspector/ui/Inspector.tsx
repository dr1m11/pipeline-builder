import { findNode, NODE_DEFINITIONS, type PipelineNode } from '@pipeline-builder/core';
import { useId } from 'react';

import { NodeKindIcon } from '@/entities/node';
import { usePipelineStore } from '@/entities/pipeline';
import { NodeProperties } from '@/features/edit-node-properties';

/** The editor's right sidebar: the properties of the selected node. */
export function Inspector() {
  return (
    <div className="flex flex-col">
      <PropertiesSection />
    </div>
  );
}

function PropertiesSection() {
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
          <NodeProperties key={node.id} node={node} />
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
