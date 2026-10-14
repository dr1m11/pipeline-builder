import type { PipelineTemplateId } from '@pipeline-builder/core';
import { Braces, type LucideIcon, MessageCircleQuestionMark, Split } from 'lucide-react';

/** The icon shown next to each built-in template's name. */
export const TEMPLATE_ICONS = {
  'ask-a-question': MessageCircleQuestionMark,
  'route-by-sentiment': Split,
  'extract-a-json-field': Braces,
} satisfies Record<PipelineTemplateId, LucideIcon>;
