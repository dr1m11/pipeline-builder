import { describe, expect, it } from 'vitest';

import { pipelineFileName } from './pipeline-file-name';

describe('pipelineFileName', () => {
  it('names the file after the pipeline', () => {
    expect(pipelineFileName('Untitled pipeline')).toBe('Untitled pipeline.pipeline.json');
  });

  it('keeps letters of any language and punctuation that file systems accept', () => {
    expect(pipelineFileName('Résumé — draft (v2), №1')).toBe(
      'Résumé — draft (v2), №1.pipeline.json',
    );
  });

  it('replaces characters that file systems refuse with dashes', () => {
    expect(pipelineFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.pipeline.json');
    expect(pipelineFileName('tab\u0000null\u007f')).toBe('tab-null-.pipeline.json');
  });

  it('collapses white space and trims dots and spaces at the ends', () => {
    expect(pipelineFileName('  ..Ask\t\ta   question..  ')).toBe('Ask a question.pipeline.json');
  });

  it('falls back to "pipeline" when nothing of the name is left', () => {
    expect(pipelineFileName(' . ')).toBe('pipeline.pipeline.json');
    expect(pipelineFileName('')).toBe('pipeline.pipeline.json');
  });
});
