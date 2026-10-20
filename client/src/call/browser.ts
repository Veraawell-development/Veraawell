/**
 * Where the call page is running — mainly: inside an app's built-in browser
 * (a link tapped in WhatsApp, Instagram, Gmail…), where the camera and mic
 * often cannot be used at all (Meta's in-app browsers neither ask nor grant).
 * The pre-join screen then says "open in Chrome/Safari" instead of failing.
 */

export type InAppBrowser =
  | 'whatsapp' | 'instagram' | 'facebook' | 'messenger' | 'gmail-google' | 'linkedin' | 'line'
  | 'snapchat' | 'telegram' | 'android-webview' | null;

const MARKERS: [InAppBrowser, RegExp][] = [
  ['instagram', /Instagram/i],
  ['messenger', /\bMessenger\b|FBAN\/Messenger/i],
  ['facebook', /FBAN|FBAV|FB_IAB|FBIOS/i],
  ['whatsapp', /WhatsApp/i],
  ['linkedin', /LinkedInApp/i],
  ['line', /\bLine\//i],
  ['snapchat', /Snapchat/i],
  ['telegram', /Telegram/i],
  ['gmail-google', /\bGSA\//i],
  ['android-webview', /; wv\)/i],
];

export function detectInAppBrowser(ua: string): InAppBrowser {
  for (const [name, re] of MARKERS) if (re.test(ua)) return name;
  return null;
}

export function isIOS(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
}

export function isAndroid(ua: string): boolean {
  return /Android/i.test(ua);
}

/** An Android intent link that opens this page in Chrome (needs a tap). */
export function androidChromeIntent(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

/** Short browser / OS names for call statistics. */
export function describeClient(ua: string): { browser: string; os: string } {
  const os = isIOS(ua) ? 'iOS' : isAndroid(ua) ? 'Android' : /Windows/i.test(ua) ? 'Windows' : /Mac OS X|Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'other';
  const inApp = detectInAppBrowser(ua);
  const browser = inApp ? `in-app:${inApp}`
    : /Edg\//.test(ua) ? 'Edge'
      : /SamsungBrowser/.test(ua) ? 'Samsung'
        : /Firefox|FxiOS/.test(ua) ? 'Firefox'
          : /CriOS|Chrome\//.test(ua) ? 'Chrome'
            : /Safari/.test(ua) ? 'Safari' : 'other';
  return { browser, os };
}
