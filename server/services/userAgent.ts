// A coarse name of the visitor's browser, from its User-Agent header: what
// the feedback issue says of where it was written ("Firefox 132 on Windows").
// Built only from the closed lists below and a major version made of digits:
// nothing of the header itself is copied, so nothing it carries (a device
// model, an app's name, text a client made up) reaches the public issue.

// Automated clients: no browser to speak of
const BOT = /bot\b|bot\/|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|curl\/|wget\/|python|go-http-client|okhttp|axios|node-fetch|java\//i

// In order: Edge and Opera also say Chrome, Chrome (and every iOS browser) also says Safari
const BROWSERS: { name: string; version: RegExp }[] = [
  { name: 'Edge', version: /\bEdg(?:e|A|iOS)?\/(\d{1,4})\b/ },
  { name: 'Opera', version: /\b(?:OPR|OPT|OPX)\/(\d{1,4})\b/ },
  { name: 'Samsung Internet', version: /\bSamsungBrowser\/(\d{1,4})\b/ },
  // FxiOS: Firefox on iOS
  { name: 'Firefox', version: /\b(?:Firefox|FxiOS)\/(\d{1,4})\b/ },
  // CriOS: Chrome on iOS
  { name: 'Chrome', version: /\b(?:Chrome|CriOS)\/(\d{1,4})\b/ },
  // Safari says its version in Version/, and Safari/ is its WebKit build
  { name: 'Safari', version: /\bVersion\/(\d{1,4})\b[^()]*\bSafari\// }
]

// In order: iOS says "like Mac OS X", Android says Linux
const SYSTEMS: { name: string; test: RegExp }[] = [
  { name: 'iPadOS', test: /\biPad\b/ },
  { name: 'iOS', test: /\b(?:iPhone|iPod)\b/ },
  { name: 'Android', test: /\bAndroid\b/ },
  { name: 'Windows', test: /\bWindows\b/ },
  { name: 'ChromeOS', test: /\bCrOS\b/ },
  { name: 'macOS', test: /\bMac OS X\b|\bMacintosh\b/ },
  { name: 'Linux', test: /\bLinux\b/ }
]

/** e.g. "Firefox 132 on Windows"; undefined for a bot or a browser not in the list */
export function describeBrowser(userAgent?: string | null): string | undefined {
  if (!userAgent) return undefined
  // Real User-Agents are a few hundred characters
  const header = userAgent.slice(0, 512)
  if (BOT.test(header)) return undefined
  const system = SYSTEMS.find(({ test }) => test.test(header))?.name
  for (const { name, version } of BROWSERS) {
    const match = version.exec(header)
    if (!match) continue
    // Safari is Apple's: a "Version/… Safari/" elsewhere is another browser (an old Android one, a web view)
    if (name === 'Safari' && !['macOS', 'iOS', 'iPadOS'].includes(system ?? '')) return undefined
    const browser = `${name} ${Number(match[1])}`
    return system ? `${browser} on ${system}` : browser
  }
  return undefined
}
