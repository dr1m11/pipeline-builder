import type { ValidationIssue } from '@pipeline-builder/core';
import { CircleAlert, TriangleAlert } from 'lucide-react';

import { usePipelineStore } from '@/entities/pipeline';
import { cn } from '@/shared/lib/cn';

import { problemName } from '../lib/describe-problem';
import { type FieldRevealRequest, useRevealProblem } from '../model/use-reveal-problem';

export interface ProblemListProps {
  /** The problems to list, in the order to show them (`ValidationReport.issues` puts errors first). */
  issues: readonly ValidationIssue[];
  /** Accessible name of the list. */
  label: string;
  /** Focuses the field of a field problem; without it, the problem's node gets focus. */
  onRevealField?: (request: FieldRevealRequest) => void;
}

/**
 * Validation problems, each with its severity, what it is about and what is wrong. Activating one
 * selects its node, edge or cycle, brings it into view and focuses it. Problems of the whole
 * pipeline are listed as plain text: there is nothing to go to.
 */
export function ProblemList({ issues, label, onRevealField }: ProblemListProps) {
  const pipeline = usePipelineStore((state) => state.pipeline);
  const reveal = useRevealProblem(onRevealField);

  return (
    <ul aria-label={label} className="flex flex-col gap-0.5">
      {issues.map((issue) => {
        const name = problemName(issue, pipeline);
        const content = <ProblemContent issue={issue} name={name} />;
        return (
          <li key={issue.id}>
            {issue.code === 'no-output' ? (
              <div className={ROW_CLASSES}>{content}</div>
            ) : (
              <button
                type="button"
                // The visible text, read in one sentence with the severity the icon shows.
                aria-label={`${severityName(issue)}: ${name}, ${issue.message}`}
                className={cn(
                  ROW_CLASSES,
                  'w-full text-left hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-focus',
                )}
                onClick={() => {
                  reveal(issue);
                }}
              >
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ROW_CLASSES = 'flex min-h-6 items-start gap-2 rounded-md px-2 py-1.5 text-sm';

function severityName(issue: ValidationIssue): string {
  return issue.severity === 'error' ? 'Error' : 'Warning';
}

function ProblemContent({ issue, name }: { issue: ValidationIssue; name: string }) {
  const isError = issue.severity === 'error';
  const Icon = isError ? CircleAlert : TriangleAlert;
  return (
    <>
      <Icon
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0', isError ? 'text-danger' : 'text-warning')}
      />
      <span className="flex min-w-0 flex-col">
        <span className="font-medium break-words">
          <span className="sr-only">{severityName(issue)}:</span> {name}
        </span>
        <span className="text-xs text-fg-muted">{issue.message}</span>
      </span>
    </>
  );
}
