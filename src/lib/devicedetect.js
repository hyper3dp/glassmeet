/**
 * Device detection utility.
 * Combines user-agent, navigator.platform, and touch capability
 * for reliable device/platform identification.
 */

export function detectDevice() {
  if (typeof navigator === 'undefined') {
    return { device: 'other', type: 'desktop', browser: 'other', isApple: false, isMobile: false, isTablet: false, isDesktop: true };
  }

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;

  // Apple device detection
  const isIPhone = /iPhone/i.test(ua);
  // iPad on iOS 13+ reports as MacIntel with touch
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  const isMac = /Mac/i.test(platform) && !isIPad && maxTouchPoints <= 1;
  const isAppleDevice = isIPhone || isIPad || isMac;

  // Android detection
  const isAndroid = /Android/i.test(ua);
  const isAndroidTablet = isAndroid && (/Tablet/i.test(ua) || /SM-T/i.test(ua) || (!/Mobile/i.test(ua) && screen.width >= 768));

  // Windows
  const isWindows = /Win/i.test(platform) || /Windows/i.test(ua);

  // Browser detection
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua) && !/CriOS/i.test(ua);
  const isChrome = (/Chrome/i.test(ua) || /CriOS/i.test(ua)) && !/Edg/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isEdge = /Edg/i.test(ua);

  // Device type
  const isMobile = isIPhone || (isAndroid && !isAndroidTablet) || /Mobile/i.test(ua);
  const isTablet = isIPad || isAndroidTablet;
  const isDesktop = !isMobile && !isTablet;

  const device = isIPhone ? 'iphone'
    : isIPad ? 'ipad'
    : isMac ? 'mac'
    : isAndroid && !isAndroidTablet ? 'android_phone'
    : isAndroidTablet ? 'android_tablet'
    : isWindows ? 'windows'
    : 'other';

  const browser = isSafari ? 'safari'
    : isChrome ? 'chrome'
    : isFirefox ? 'firefox'
    : isEdge ? 'edge'
    : 'other';

  return { device, type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop', browser, isApple: isAppleDevice, isMobile, isTablet, isDesktop };
}

let cached = null;
export function getDevice() {
  if (!cached) cached = detectDevice();
  return cached;
}

// Smart calendar prioritization based on device platform.
// Returns an ordered array of calendar types: 'apple', 'google', 'outlook', 'webcal'
// Other options are never hidden — users can always manually choose.
export function getCalendarPriority() {
  const d = getDevice();
  if (d.isApple) {
    // iPhone, iPad, Mac → Apple first, then Outlook, then Google
    return ['apple', 'outlook', 'google', 'webcal'];
  } else if (d.device === 'windows') {
    // Windows → Outlook first, then Google, then WebCal
    return ['outlook', 'google', 'webcal', 'apple'];
  } else {
    // Android and others → Google first, then Outlook, then WebCal
    return ['google', 'outlook', 'webcal', 'apple'];
  }
}