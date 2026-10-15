import { createApp } from './app';
import { createAnthropicProvider } from './providers/anthropic-provider';
import { createMockProvider } from './providers/mock-provider';
import { createOpenAiProvider } from './providers/openai-provider';

/** Pause before each token of the mock provider: slow enough to watch the answer stream in. */
const MOCK_TOKEN_DELAY_MS = 40;

const app = createApp({
  providers: {
    mock: createMockProvider({ tokenDelayMs: MOCK_TOKEN_DELAY_MS }),
    anthropic: createAnthropicProvider(),
    openai: createOpenAiProvider(),
  },
});

// The Workers runtime takes the handler from the default export.
export default app satisfies ExportedHandler<Env>;
