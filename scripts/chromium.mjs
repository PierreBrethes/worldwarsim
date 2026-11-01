import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

/** Le Chromium que Playwright a mis en cache sur le Mac (`npx playwright install chromium`). */
export const chromiumPath = () => {
  const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
  const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  return existsSync(`${cache}/chrome-mac-arm64/${app}`)
    ? `${cache}/chrome-mac-arm64/${app}`
    : `${cache}/chrome-mac/${app}`;
};
