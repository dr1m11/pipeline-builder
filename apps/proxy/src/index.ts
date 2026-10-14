import { createApp } from './app';
import { createMockProvider } from './providers/mock-provider';

/** Pause before each token of the mock provider: slow enough to watch the answer stream in. */
const MOCK_TOKEN_DELAY_MS = 40;

const app = createApp({
  providers: { mock: createMockProvider({ tokenDelayMs: MOCK_TOKEN_DELAY_MS }) },
});

// The Workers runtime takes the handler from the default export.
export default app satisfies ExportedHandler<Env>;
