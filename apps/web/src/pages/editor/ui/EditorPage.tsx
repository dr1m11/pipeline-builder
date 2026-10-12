import '@xyflow/react/dist/style.css';

import { createEmptyPipeline } from '@pipeline-builder/core';
import { Background, Controls, MiniMap, ReactFlow } from '@xyflow/react';

const initialPipeline = createEmptyPipeline({ id: 'draft', name: 'Untitled pipeline' });

export function EditorPage() {
  return (
    <div className="editor-page">
      <header className="editor-page__header">
        <h1 className="editor-page__title">{initialPipeline.name}</h1>
      </header>
      <main className="editor-page__canvas" aria-label="Pipeline canvas">
        <ReactFlow nodes={[]} edges={[]} fitView>
          <Background />
          <Controls />
          <MiniMap ariaLabel="Pipeline overview" />
        </ReactFlow>
      </main>
    </div>
  );
}
