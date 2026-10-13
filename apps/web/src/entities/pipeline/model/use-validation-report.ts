import { validatePipeline, type ValidationReport } from '@pipeline-builder/core';

import { usePipelineStore } from './store-context';

/**
 * Validation report of the pipeline in the surrounding store. Core caches the report per pipeline
 * object, so the selector returns the same report until the pipeline changes (see docs/adr/0008).
 */
export function useValidationReport(): ValidationReport {
  return usePipelineStore((state) => validatePipeline(state.pipeline));
}
