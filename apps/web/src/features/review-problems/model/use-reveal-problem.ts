import type { ValidationIssue } from '@pipeline-builder/core';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useCallback } from 'react';

import { usePipelineStoreApi } from '@/entities/pipeline';
import { useMediaQuery } from '@/shared/lib/media';

import { type ProblemFocus, problemLocation } from '../lib/describe-problem';

/** A data field to focus in the properties form: the field of a problem the user revealed. */
export interface FieldRevealRequest {
  readonly nodeId: string;
  readonly field: string;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const FIT_DURATION_MS = 200;
// Fitting a single node would otherwise zoom far in.
const FIT_MAX_ZOOM = 1;

/**
 * Returns a function that takes the user to a problem: it selects the problem's node, edge or
 * cycle, brings it into view (without animation when the user prefers reduced motion) and focuses
 * it. A field problem is handed to `onRevealField`, which focuses the field in the properties form;
 * without that callback the node is focused instead. Problems of the whole pipeline are ignored.
 */
export function useRevealProblem(
  onRevealField?: (request: FieldRevealRequest) => void,
): (issue: ValidationIssue) => void {
  const store = usePipelineStoreApi();
  const flowStore = useStoreApi();
  const { fitView } = useReactFlow();
  const reducedMotion = useMediaQuery(REDUCED_MOTION);

  return useCallback(
    (issue: ValidationIssue) => {
      const location = problemLocation(issue, store.getState().pipeline);
      if (location === null) return;
      store.getState().select({ nodeIds: location.nodeIds, edgeIds: location.edgeIds });
      const shown = fitView({
        nodes: location.visibleNodeIds.map((id) => ({ id })),
        duration: reducedMotion ? 0 : FIT_DURATION_MS,
        maxZoom: FIT_MAX_ZOOM,
      });

      const { focus } = location;
      if (focus.kind === 'field' && onRevealField !== undefined) {
        onRevealField({ nodeId: focus.nodeId, field: focus.field });
        return;
      }
      // React Flow jumps to a node that gets focus off screen, which would cut the fit short.
      void shown.then(() => {
        focusFlowElement(flowStore.getState().domNode, focus);
      });
    },
    [store, flowStore, fitView, reducedMotion, onRevealField],
  );
}

/** Focuses the canvas element of a node or an edge; React Flow makes both focusable. */
function focusFlowElement(root: Element | null, focus: ProblemFocus): void {
  const [selector, id] =
    focus.kind === 'edge'
      ? ['.react-flow__edge', focus.edgeId]
      : ['.react-flow__node', focus.nodeId];
  // Compared as attributes rather than in a selector, so any id works without escaping.
  const element = [...(root?.querySelectorAll<HTMLElement | SVGElement>(selector) ?? [])].find(
    (candidate) => candidate.getAttribute('data-id') === id,
  );
  element?.focus();
}
