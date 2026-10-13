import * as z from 'zod';

import { REQUIRED_MESSAGE } from './field-rules';

export const NODE_LABEL_MAX_LENGTH = 60;

/** A node label as the user types it: trimmed, then not empty and not longer than the maximum. */
export const NODE_LABEL_SCHEMA = z
  .string()
  .trim()
  .min(1, REQUIRED_MESSAGE)
  .max(NODE_LABEL_MAX_LENGTH, `Must be at most ${String(NODE_LABEL_MAX_LENGTH)} characters`);
