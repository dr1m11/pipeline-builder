import type { Pipeline } from '@pipeline-builder/core';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useEffect, useRef } from 'react';

import { usePipelineStore, usePipelineStoreApi } from '@/entities/pipeline';
import { useMediaQuery } from '@/shared/lib/media';

import { REDUCED_MOTION_QUERY, VIEWPORT_MOVE_MS } from '../config/viewport';
// Fitting a small pipeline would otherwise zoom far in.
const FIT_MAX_ZOOM = 1;
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

/**
 * Brings each new document into view when the store replaces the whole pipeline (an import, a
 * template, a new pipeline, or an undo or a redo of one), without animation when the user prefers
 * reduced motion. The document the canvas opens with is left to the canvas's own `fitView`.
 *
 * When focus was lost with the replaced document (the control that replaced it, such as a template
 * button on the empty canvas, or a node of the old document, is gone), the first node of the new
 * one gets it once the view fits, so keyboard users go on from the canvas rather than from the top
 * of the page. Call it inside React Flow's provider.
 */
export function useFitReplacedDocument(): void {
  const store = usePipelineStoreApi();
  const flowStore = useStoreApi();
  const documentKey = usePipelineStore((state) => state.documentKey);
  const { fitView, setViewport } = useReactFlow();
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const shownKeyRef = useRef(documentKey);

  useEffect(() => {
    if (shownKeyRef.current === documentKey) return;
    shownKeyRef.current = documentKey;
    const duration = reducedMotion ? 0 : VIEWPORT_MOVE_MS;
    if (store.getState().pipeline.nodes.length > 0) {
      // React Flow keeps the fit pending until the new nodes are measured. It also jumps to a node
      // that gets focus off screen, so focus waits for the fit.
      void fitView({ duration, maxZoom: FIT_MAX_ZOOM }).then(() => {
        focusFirstNodeIfFocusIsLost(flowStore.getState().domNode, store.getState().pipeline);
      });
    } else {
      // A fit pending on an empty canvas would fire on the first node added and zoom in on it.
      void setViewport(DEFAULT_VIEWPORT, { duration });
    }
  }, [documentKey, store, flowStore, fitView, setViewport, reducedMotion]);
}

/** Focuses the first node of `pipeline` on the canvas, unless something on the page has focus. */
function focusFirstNodeIfFocusIsLost(root: Element | null, pipeline: Pipeline): void {
  const active = root?.ownerDocument.activeElement ?? null;
  const isLost = active === null || active === active.ownerDocument.body || !active.isConnected;
  const [first] = pipeline.nodes;
  if (!isLost || first === undefined) return;
  // Compared as attributes rather than in a selector, so any id works without escaping.
  const element = [...(root?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [])].find(
    (candidate) => candidate.getAttribute('data-id') === first.id,
  );
  element?.focus();
}
