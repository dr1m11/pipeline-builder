import { afterEach, describe, expect, it, vi } from 'vitest';

import { isApplePlatform } from './platform';

describe('isApplePlatform', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['MacIntel', 'iPhone', 'iPad'])('recognises the Apple platform "%s"', (platform) => {
    expect(isApplePlatform({ platform })).toBe(true);
  });

  it.each(['Win32', 'Linux x86_64', ''])('does not take "%s" for an Apple platform', (platform) => {
    expect(isApplePlatform({ platform })).toBe(false);
  });

  it('prefers the client hints over the older platform string', () => {
    expect(isApplePlatform({ userAgentData: { platform: 'macOS' }, platform: 'Win32' })).toBe(true);
    expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(
      false,
    );
  });

  it('reads the platform of the browser by default', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');

    expect(isApplePlatform()).toBe(true);
  });
});
