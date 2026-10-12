import type { NodeKind } from '@pipeline-builder/core';
import {
  FileOutput,
  type LucideIcon,
  type LucideProps,
  MessageSquareText,
  Shuffle,
  Sparkles,
  Split,
  TextCursorInput,
} from 'lucide-react';

const ICONS: Record<NodeKind, LucideIcon> = {
  input: TextCursorInput,
  prompt: MessageSquareText,
  'llm-call': Sparkles,
  transform: Shuffle,
  condition: Split,
  output: FileOutput,
};

export interface NodeKindIconProps extends LucideProps {
  kind: NodeKind;
}

/** Decorative icon of a node kind; the surrounding text names the kind. */
export function NodeKindIcon({ kind, ...props }: NodeKindIconProps) {
  const Icon = ICONS[kind];
  return <Icon aria-hidden {...props} />;
}
