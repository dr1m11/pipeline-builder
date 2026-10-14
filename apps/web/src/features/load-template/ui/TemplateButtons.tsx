import { PIPELINE_TEMPLATES } from '@pipeline-builder/core';
import { useId } from 'react';

import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui/button';

import { TEMPLATE_ICONS } from '../config/template-icons';
import { useNewPipeline } from '../model/use-new-pipeline';

export interface TemplateButtonsProps {
  className?: string;
}

/**
 * "Start from a template:" and a button per built-in template, e.g. for an empty canvas. A button
 * replaces the surrounding pipeline with a new one made from its template, as one undoable step.
 * Needs `ToastProvider` above it.
 */
export function TemplateButtons({ className }: TemplateButtonsProps) {
  const { loadTemplate } = useNewPipeline();
  const labelId = useId();

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn('flex flex-wrap items-center justify-center gap-2', className)}
    >
      <span id={labelId}>Start from a template:</span>
      {PIPELINE_TEMPLATES.map((template) => {
        const Icon = TEMPLATE_ICONS[template.id];
        return (
          <Button
            key={template.id}
            size="sm"
            onClick={() => {
              loadTemplate(template);
            }}
          >
            <Icon aria-hidden />
            {template.name}
          </Button>
        );
      })}
    </div>
  );
}
