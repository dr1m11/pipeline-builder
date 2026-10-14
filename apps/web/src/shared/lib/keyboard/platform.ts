/** Where the platform name is read from: `navigator` in the browser. */
export interface PlatformInfo {
  /** User-Agent Client Hints, not in every browser yet: "macOS", "Windows", "iOS". */
  readonly userAgentData?: { readonly platform: string } | undefined;
  /** The older, frozen platform string: "MacIntel", "Win32", "iPhone". */
  readonly platform?: string;
}

const APPLE_PLATFORM = /mac|iphone|ipad|ipod|ios/i;

/** Whether the app runs on macOS or iOS, where shortcuts take ⌘ instead of Ctrl. */
export function isApplePlatform(info: PlatformInfo = navigator): boolean {
  return APPLE_PLATFORM.test(info.userAgentData?.platform ?? info.platform ?? '');
}
