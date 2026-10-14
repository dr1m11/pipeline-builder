import { PIPELINE_TEMPLATES } from '@pipeline-builder/core';
import { ChevronDown, File, FilePlusCorner } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

import { TEMPLATE_ICONS } from '../config/template-icons';
import { useNewPipeline } from '../model/use-new-pipeline';

/**
 * The "New" menu: a blank pipeline or one of the built-in templates, each described by a hint. The
 * choice replaces the surrounding pipeline as one undoable step. Needs `ToastProvider` above it.
 */
export function NewPipelineMenu() {
  const { loadTemplate, startBlank } = useNewPipeline();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <FilePlusCorner aria-hidden />
          New
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem icon={<File />} onSelect={startBlank}>
          Blank pipeline
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Templates</DropdownMenuLabel>
        {PIPELINE_TEMPLATES.map((template) => {
          const Icon = TEMPLATE_ICONS[template.id];
          return (
            <DropdownMenuItem
              key={template.id}
              icon={<Icon />}
              hint={template.description}
              onSelect={() => {
                loadTemplate(template);
              }}
            >
              {template.name}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
