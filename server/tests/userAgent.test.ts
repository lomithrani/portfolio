import { describe, expect, it } from 'bun:test';
import { describeBrowser } from '../services/userAgent';

describe('describeBrowser', () => {
  it.each([
    [
      'Firefox on Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Firefox 132 on Windows'
    ],
    [
      'Chrome on macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome 131 on macOS'
    ],
    [
      'Edge on Windows (it also says Chrome and Safari)',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86',
      'Edge 131 on Windows'
    ],
    [
      'Opera on Linux (it also says Chrome)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'Opera 115 on Linux'
    ],
    [
      'Samsung Internet on Android',
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
      'Samsung Internet 26 on Android'
    ],
    [
      'Chrome on Android',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      'Chrome 131 on Android'
    ],
    [
      'Safari on iOS (it says "like Mac OS X")',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
      'Safari 18 on iOS'
    ],
    [
      'Safari on iPadOS',
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari 17 on iPadOS'
    ],
    [
      'Safari on macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      'Safari 18 on macOS'
    ],
    [
      'Chrome on iOS (CriOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
      'Chrome 131 on iOS'
    ],
    [
      'Firefox on iOS (FxiOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
      'Firefox 132 on iOS'
    ],
    [
      'Edge on Android (EdgA)',
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0',
      'Edge 131 on Android'
    ],
    [
      'Chrome on ChromeOS',
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome 131 on ChromeOS'
    ],
    ['a browser without a system', 'Firefox/120.0', 'Firefox 120']
  ])('names %s', (_, userAgent, expected) => {
    expect(describeBrowser(userAgent)).toBe(expected);
  });

  it.each([
    ['nothing', undefined],
    ['an empty header', ''],
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    [
      'a bot pretending to be Chrome',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.0.0 Safari/537.36'
    ],
    [
      'headless Chrome',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36'
    ],
    ['curl', 'curl/8.5.0'],
    ['a script', 'python-requests/2.32.3'],
    ['an unknown browser', 'SomeBrowser/1.0 (Unknown OS)'],
    ['a version that is not digits', 'Mozilla/5.0 (Windows NT 10.0) Firefox/abc'],
    [
      'a "Version/ Safari" that is not Apple’s (an old Android browser)',
      'Mozilla/5.0 (Linux; U; Android 4.0.3; en-us) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
    ]
  ])('says nothing for %s', (_, userAgent) => {
    expect(describeBrowser(userAgent)).toBeUndefined();
  });

  it('builds the name from its own words only: nothing of the header is copied', () => {
    const forged = 'Mozilla/5.0 (Windows NT 10.0; @octocat see #12 `x`) Firefox/132.0 <img src=x>';
    expect(describeBrowser(forged)).toBe('Firefox 132 on Windows');
    // A huge version is not a version: at most 4 digits
    expect(describeBrowser('Mozilla/5.0 (Windows NT 10.0) Firefox/1234567')).toBeUndefined();
    // Leading zeros go
    expect(describeBrowser('Mozilla/5.0 (Windows NT 10.0) Firefox/0132.0')).toBe('Firefox 132 on Windows');
  });
});
