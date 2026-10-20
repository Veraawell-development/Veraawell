/**
 * What to tell someone whose camera or microphone didn't start — in their
 * browser's own words, so they can fix it themselves.
 */

import type { MediaErrorKind } from './media';
import { detectInAppBrowser, isAndroid, isIOS } from './browser';

export interface PermissionHelp {
  title: string;
  steps: string[];
}

function platform(ua: string): 'ios' | 'android' | 'safari-mac' | 'desktop' {
  if (isIOS(ua)) return 'ios';
  if (isAndroid(ua)) return 'android';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|Edg|Firefox/.test(ua)) return 'safari-mac';
  return 'desktop';
}

export function permissionHelp(kind: MediaErrorKind | null, ua: string, voice: boolean): PermissionHelp | null {
  if (!kind) return null;
  const what = voice ? 'microphone' : 'camera and microphone';
  if (detectInAppBrowser(ua)) {
    return {
      title: `This app's browser can't use your ${what}`,
      steps: [isIOS(ua) ? 'Tap ⋯ (or the share icon) and choose "Open in Safari".' : 'Tap ⋮ and choose "Open in Chrome" — or use the button below.', 'Then join the session from there.'],
    };
  }
  const p = platform(ua);
  switch (kind) {
    case 'permission-denied':
      if (p === 'ios') return { title: `Allow the ${what}`, steps: ['Open the iPhone Settings app → Safari → Camera and Microphone → "Allow".', 'Come back here and tap "Try again".'] };
      if (p === 'android') return { title: `Allow the ${what}`, steps: ['Tap the icon left of the address bar → Permissions.', `Turn on ${voice ? 'Microphone' : 'Camera and Microphone'}, then tap "Try again".`] };
      if (p === 'safari-mac') return { title: `Allow the ${what}`, steps: ['Safari menu → Settings for this website.', `Set ${voice ? 'Microphone' : 'Camera and Microphone'} to "Allow", then click "Try again".`] };
      return { title: `Allow the ${what}`, steps: ['Click the camera or lock icon in the address bar.', `Allow ${voice ? 'the microphone' : 'the camera and microphone'}, then click "Try again".`] };
    case 'permission-denied-system':
      return p === 'safari-mac' || p === 'desktop'
        ? { title: 'Your computer is blocking it', steps: ['Mac: System Settings → Privacy & Security → Camera / Microphone → turn on your browser.', 'Windows: Settings → Privacy → Camera / Microphone → allow desktop apps.', 'Restart the browser, then come back.'] }
        : { title: 'Your phone is blocking it', steps: ['Open your phone Settings → Apps → your browser → Permissions.', `Allow ${voice ? 'the microphone' : 'the camera and microphone'}.`] };
    case 'no-device':
      return { title: `No ${voice ? 'microphone' : 'camera or microphone'} found`, steps: ['Plug one in (or connect your headset), then click "Try again".'] };
    case 'device-in-use':
      return { title: 'Another app is using it', steps: ['Close Zoom, Meet, Teams, WhatsApp calls or other tabs that use the camera.', 'Then click "Try again".'] };
    case 'insecure':
      return { title: 'This page must be opened securely', steps: ['Open https://veraawell.com and join from your dashboard.'] };
    case 'unsupported':
      return { title: "This browser can't make calls", steps: [p === 'ios' ? 'Open this page in Safari.' : 'Open this page in Chrome, Edge, Firefox or Safari.'] };
    case 'constraints':
    case 'aborted':
    case 'unknown':
    default:
      return { title: `Your ${what} didn't start`, steps: ['Check it is connected and not used by another app, then click "Try again".'] };
  }
}
