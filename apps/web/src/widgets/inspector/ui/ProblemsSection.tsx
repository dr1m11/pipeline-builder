import type { ValidationReport } from '@pipeline-builder/core';
import { ChevronRight, CircleAlert, TriangleAlert } from 'lucide-react';
import { Collapsible } from 'radix-ui';
import { useId, useState } from 'react';

import { useValidationReport } from '@/entities/pipeline';
import { type FieldRevealRequest, ProblemList } from '@/features/review-problems';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/badge';

export interface ProblemsSectionProps {
  onRevealField: (request: FieldRevealRequest) => void;
}

/**
 * Every problem of the pipeline in a collapsible section, open by default. Its heading counts
 * errors and warnings; activating a problem takes the user to it.
 */
export function ProblemsSection({ onRevealField }: ProblemsSectionProps) {
  const headingId = useId();
  const [open, setOpen] = useState(true);
  const report = useValidationReport();
  const { errorCount, warningCount } = report;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} asChild>
      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-2 border-t border-border p-3"
      >
        <h2 id={headingId}>
          <Collapsible.Trigger
            aria-label={problemsLabel(report)}
            className="flex min-h-6 w-full items-center gap-1.5 rounded-md text-xs font-semibold tracking-wide text-fg-muted uppercase hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <ChevronRight
              aria-hidden
              className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')}
            />
            Problems
            <span className="ml-auto flex items-center gap-1 normal-case">
              {errorCount > 0 && (
                <Badge tone="danger">
                  <CircleAlert aria-hidden />
                  {errorCount}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge tone="warning">
                  <TriangleAlert aria-hidden />
                  {warningCount}
                </Badge>
              )}
            </span>
          </Collapsible.Trigger>
        </h2>
        <Collapsible.Content>
          {report.issues.length === 0 ? (
            <p className="text-sm text-fg-muted">No problems</p>
          ) : (
            <ProblemList
              issues={report.issues}
              label="Problems of the pipeline"
              onRevealField={onRevealField}
            />
          )}
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}

/** "Problems: 2 errors, 1 warning", or "Problems: none". */
function problemsLabel({ errorCount, warningCount }: ValidationReport): string {
  if (errorCount + warningCount === 0) return 'Problems: none';
  const counts = [
    errorCount > 0 ? plural(errorCount, 'error') : null,
    warningCount > 0 ? plural(warningCount, 'warning') : null,
  ].filter((part) => part !== null);
  return `Problems: ${counts.join(', ')}`;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
