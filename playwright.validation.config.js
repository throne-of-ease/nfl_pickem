import config from './playwright.config.js'
export default { ...config, timeout: 120000, workers: 2, projects: [
  { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 900 } } },
  { name: 'mobile', use: { browserName: 'chromium', viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true } },
  { name: 'iphone12pro', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] }
