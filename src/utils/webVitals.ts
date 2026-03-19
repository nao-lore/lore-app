/**
 * Lightweight Web Vitals collection using the native Performance API.
 * Reports FCP, LCP, CLS, and INP.
 * - In dev mode: logs to console
 * - In production: sends to Vercel Analytics via track()
 */

type MetricName = 'FCP' | 'LCP' | 'CLS' | 'INP';

function reportMetric(name: MetricName, value: number): void {
  const rounded = Math.round(name === 'CLS' ? value * 1000 : value);

  if (import.meta.env.DEV) {
    console.log(`[Web Vitals] ${name}: ${rounded}${name === 'CLS' ? ' (x1000)' : 'ms'}`);
    return;
  }

  import('@vercel/analytics').then(({ track }) => {
    track('web-vital', { metric: name, value: rounded });
  }).catch(() => {
    // Analytics unavailable — silently ignore
  });
}

export function observeWebVitals(): void {
  if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

  // FCP — First Contentful Paint
  try {
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          reportMetric('FCP', entry.startTime);
          fcpObserver.disconnect();
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });
  } catch {
    // Observer not supported for this type
  }

  // LCP — Largest Contentful Paint
  try {
    let lcpValue = 0;
    const lcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        lcpValue = entry.startTime;
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // Report LCP when the page is hidden (final value)
    const reportLCP = () => {
      if (lcpValue > 0) {
        reportMetric('LCP', lcpValue);
        lcpObserver.disconnect();
      }
    };
    addEventListener('visibilitychange', reportLCP, { once: true });
    addEventListener('pagehide', reportLCP, { once: true });
  } catch {
    // Observer not supported for this type
  }

  // CLS — Cumulative Layout Shift
  try {
    let clsValue = 0;
    let sessionValue = 0;
    let sessionEntries: PerformanceEntry[] = [];

    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (layoutShift.hadRecentInput) continue;

        const firstEntry = sessionEntries[0];
        if (
          sessionEntries.length > 0 &&
          entry.startTime - (sessionEntries[sessionEntries.length - 1]?.startTime ?? 0) < 1000 &&
          firstEntry &&
          entry.startTime - firstEntry.startTime < 5000
        ) {
          sessionValue += layoutShift.value;
        } else {
          sessionValue = layoutShift.value;
          sessionEntries = [];
        }
        sessionEntries.push(entry);
        if (sessionValue > clsValue) {
          clsValue = sessionValue;
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    const reportCLS = () => {
      reportMetric('CLS', clsValue);
      clsObserver.disconnect();
    };
    addEventListener('visibilitychange', reportCLS, { once: true });
    addEventListener('pagehide', reportCLS, { once: true });
  } catch {
    // Observer not supported for this type
  }

  // INP — Interaction to Next Paint
  try {
    let inpValue = 0;
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEntry & { duration: number };
        if (eventEntry.duration > inpValue) {
          inpValue = eventEntry.duration;
        }
      }
    });
    inpObserver.observe({ type: 'event', buffered: true });

    const reportINP = () => {
      if (inpValue > 0) {
        reportMetric('INP', inpValue);
        inpObserver.disconnect();
      }
    };
    addEventListener('visibilitychange', reportINP, { once: true });
    addEventListener('pagehide', reportINP, { once: true });
  } catch {
    // Observer not supported for this type
  }
}
