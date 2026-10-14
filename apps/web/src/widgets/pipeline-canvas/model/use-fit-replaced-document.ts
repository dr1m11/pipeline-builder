import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef } from 'react';

import { usePipelineStore, usePipelineStoreApi } from '@/entities/pipeline';
import { useMediaQuery } from '@/shared/lib/media';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const FIT_DURATION_MS = 200;
// Fitting a small pipeline would otherwise zoom far in.
const FIT_MAX_ZOOM = 1;
const DEFAULT_VIEWPORT = { x: 0, y: 0, zoom: 1 };

/**
 * Brings each new document into view when the store replaces the whole pipeline (an import, a
 * template, a new pipeline, or an undo or a redo of one), without animation when the user prefers
 * reduced motion. The document the canvas opens with is left to the canvas's own `fitView`. Call it
 * inside React Flow's provider.
 */
export function useFitReplacedDocument(): void {
  const store = usePipelineStoreApi();
  const documentKey = usePipelineStore((state) => state.documentKey);
  const { fitView, setViewport } = useReactFlow();
  const reducedMotion = useMediaQuery(REDUCED_MOTION);
  const shownKeyRef = useRef(documentKey);

  useEffect(() => {
    if (shownKeyRef.current === documentKey) return;
    shownKeyRef.current = documentKey;
    const duration = reducedMotion ? 0 : FIT_DURATION_MS;
    if (store.getState().pipeline.nodes.length > 0) {
      // React Flow keeps the fit pending until the new nodes are measured.
      void fitView({ duration, maxZoom: FIT_MAX_ZOOM });
    } else {
      // A fit pending on an empty canvas would fire on the first node added and zoom in on it.
      void setViewport(DEFAULT_VIEWPORT, { duration });
    }
  }, [documentKey, store, fitView, setViewport, reducedMotion]);
}
