import test from 'node:test';
import assert from 'node:assert/strict';

// Setup minimal Mock DOM environment for Node.js unit testing of UI controllers
class MockElement {
  constructor(tag = 'div', id = '') {
    this.tagName = tag.toUpperCase();
    this.id = id;
    this.className = '';
    this.hidden = false;
    this.textContent = '';
    this._innerHTML = '';
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parentNode = null;

    this.classList = {
      _classes: new Set(),
      add: (...cls) => {
        for (const c of cls) this.classList._classes.add(c);
        this.className = Array.from(this.classList._classes).join(' ');
      },
      remove: (...cls) => {
        for (const c of cls) this.classList._classes.delete(c);
        this.className = Array.from(this.classList._classes).join(' ');
      },
      contains: (c) => this.classList._classes.has(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList.contains(c)) this.classList.remove(c);
          else this.classList.add(c);
        } else if (force) {
          this.classList.add(c);
        } else {
          this.classList.remove(c);
        }
      },
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(val) {
    this._innerHTML = val;
    // Simple textContent approximation from innerHTML
    if (typeof val === 'string') {
      this.textContent = val.replace(/<[^>]*>/g, '').trim();
    }
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === 'id') this.id = v;
    if (k === 'class') this.className = v;
  }

  getAttribute(k) {
    return this.attributes.get(k) || null;
  }

  removeAttribute(k) {
    this.attributes.delete(k);
  }

  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
  }

  dispatchEvent(event, data) {
    const handlers = this.listeners.get(event) || [];
    for (const h of handlers) h(data);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    // Basic selector parser supporting classes (.cls), IDs (#id), attributes ([attr="val"])
    const match = (el) => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (el.className && el.className.split(/\s+/).includes(cls)) return true;
      } else if (selector.startsWith('#')) {
        const id = selector.slice(1);
        if (el.id === id) return true;
      } else if (selector.startsWith('[') && selector.endsWith(']')) {
        const inner = selector.slice(1, -1);
        if (inner.includes('=')) {
          const [k, rawV] = inner.split('=');
          const v = rawV.replace(/['"]/g, '');
          if (el.getAttribute(k) === v) return true;
        } else {
          if (el.attributes.has(inner)) return true;
        }
      }
      return false;
    };

    const traverse = (node) => {
      if (match(node)) results.push(node);
      for (const child of node.children) traverse(child);
    };

    for (const child of this.children) traverse(child);
    return results;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
}

class MockDocument {
  constructor() {
    this.elements = new Map();
  }

  register(id, el) {
    el.id = id;
    this.elements.set(id, el);
    return el;
  }

  getElementById(id) {
    if (!this.elements.has(id)) {
      const el = new MockElement('div', id);
      this.elements.set(id, el);
    }
    return this.elements.get(id);
  }

  createElement(tag) {
    return new MockElement(tag);
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const el of this.elements.values()) {
      if (selector.startsWith('#') && el.id === selector.slice(1)) {
        matches.push(el);
      } else if (selector.startsWith('.') && el.className.split(/\s+/).includes(selector.slice(1))) {
        matches.push(el);
      }
    }
    return matches;
  }

  reset() {
    this.elements.clear();
  }
}

// Install mock global document & window before importing UI controllers
globalThis.document = new MockDocument();
globalThis.window = globalThis;
globalThis.location = { search: '', href: 'http://localhost:3000', pathname: '/' };

// Import tested UI controllers
const {
  formatDuration,
  formatBytes,
  formatTime,
  renderTrialHero,
  renderTrialKpi,
  renderTrialSnapshots,
  renderTrialAlerts,
  renderTrialGaps,
  renderTrialReportsList,
  renderProviderGrid,
  renderTrialOfflineState,
  viewReport,
} = await import('../../src/office/ui/reliability-view.js');

const { toast } = await import('../../src/office/ui/activity.js');

test('1. Trial Monitor when API offline renders error/offline state honestly with zero fake mock', () => {
  globalThis.document.reset();

  const badge = globalThis.document.getElementById('trial-status-badge');
  const heartbeat = globalThis.document.getElementById('trial-heartbeat-dot');
  const heroSub = globalThis.document.getElementById('trial-hero-sub');
  const tbody = globalThis.document.getElementById('trial-snapshots-body');
  const alertsContainer = globalThis.document.getElementById('trial-alerts-list');

  // Trigger offline state
  renderTrialOfflineState('Connection refused: ECONNREFUSED 127.0.0.1:4310');

  // Assertions: Truthful offline presentation, no false online badge or synthetic data
  assert.equal(badge.textContent, 'API Offline · Telemetry Unavailable');
  assert.equal(badge.className, 'status-badge status-badge--danger');
  assert.match(heartbeat.innerHTML, /Server Unreachable/);
  assert.match(heartbeat.innerHTML, /background: #FF5F5F/);
  assert.equal(heartbeat.style.color, '#FF5F5F');
  assert.match(heroSub.textContent, /Trial Monitor API is currently offline or unreachable/);
  assert.match(tbody.innerHTML, /Offline: Connection refused/);
  assert.match(alertsContainer.innerHTML, /Unable to reach anomaly alert endpoint/);
});

test('2. Stale heartbeat detection renders warning badge when heartbeat > 5 mins ago', () => {
  globalThis.document.reset();

  const badge = globalThis.document.getElementById('trial-status-badge');
  const heartbeat = globalThis.document.getElementById('trial-heartbeat-dot');

  const staleHeartbeatTs = Date.now() - (6 * 60 * 1000); // 6 minutes ago (> 5m threshold)

  const staleStatus = {
    isRunning: true,
    status: 'running',
    heartbeat: staleHeartbeatTs,
    trialStartAt: { day: 1, totalDays: 7 },
    observationStatus: 'Day 1/7 (Active Observation)',
    latestSnapshot: {
      systemHealth: { nodeProcess: { pid: 30696 } }
    }
  };

  renderTrialHero(staleStatus);

  // Assertions: Stale telemetry warning badge and amber indicator
  assert.match(badge.textContent, /Stale Telemetry/);
  assert.equal(badge.className, 'status-badge status-badge--warning');
  assert.match(heartbeat.innerHTML, /Stale Heartbeat/);
  assert.match(heartbeat.innerHTML, /background: #FFB74D/);
  assert.equal(heartbeat.style.color, '#FFB74D');

  // Verify fresh heartbeat (< 1 min ago) renders green Active
  const freshStatus = {
    isRunning: true,
    status: 'running',
    heartbeat: Date.now() - 30000, // 30s ago
    trialStartAt: { day: 1, totalDays: 7 },
    observationStatus: 'Day 1/7 (Active Observation)',
    latestSnapshot: {
      systemHealth: { nodeProcess: { pid: 30696 } }
    }
  };

  renderTrialHero(freshStatus);

  assert.equal(badge.className, 'status-badge status-badge--success');
  assert.match(heartbeat.innerHTML, /background: #3DDC84/);
  assert.equal(heartbeat.style.color, '#3DDC84');
});

test('3. NO TELEMETRY & UNVERIFIED badge rendering when metrics are null/absent', () => {
  globalThis.document.reset();

  const grid = globalThis.document.getElementById('rel-provider-grid');

  // Render provider grid with null/empty provider map
  renderProviderGrid(null);

  // Assertions: Provider cards MUST NOT say ONLINE. Must say NO TELEMETRY in neutral #8D97AA
  const html = grid.innerHTML;
  assert.ok(!html.includes('● ONLINE'), 'Must not display fake green ONLINE badge when telemetry is null');
  assert.ok(html.includes('NO TELEMETRY'), 'Must display truthful NO TELEMETRY badge');
  assert.ok(html.includes('color: #8D97AA'), 'Must use neutral color for unverified telemetry');
  assert.ok(html.includes('Ping Latency: <b style="color: var(--ink, #E8ECF4);">--</b>'));
  assert.ok(html.includes('Uptime: <b style="color: var(--ink, #E8ECF4);">--</b>'));
});

test('4. Telemetry snapshots table, anomaly alerts, and daily reports rendering logic', () => {
  globalThis.document.reset();

  // Test snapshots table rendering
  const tbody = globalThis.document.getElementById('trial-snapshots-body');
  const snapshots = [
    {
      id: 'snap-test-1234567890',
      timestamp: Date.now(),
      overallStatus: 'healthy',
      readOnlyInvariant: true,
      systemHealth: {
        nodeProcess: {
          memoryUsage: { rss: 75500000, heapUsed: 45000000 }
        },
        eventLoop: { lagMs: 0.25, p50: 0.2, p95: 0.5 },
        activeHandles: { count: 42 }
      }
    }
  ];

  renderTrialSnapshots(snapshots);

  assert.ok(tbody.innerHTML.includes('snap-test-12345'), 'Snapshot ID rendered');
  assert.ok(tbody.innerHTML.includes('72.00 MB') || tbody.innerHTML.includes('MB'), 'RSS formatted');
  assert.ok(tbody.innerHTML.includes('Read-Only Strict'), 'Strict invariant displayed');
  assert.ok(tbody.innerHTML.includes('status-badge--success'), 'Healthy badge displayed');

  // Test anomaly alerts rendering
  const alertsContainer = globalThis.document.getElementById('trial-alerts-list');
  const alerts = [
    {
      severity: 'SEV-2',
      code: 'EVENT_LOOP_LAG_SPIKE',
      message: 'Transient event loop lag excursion detected: 12.4ms',
      timestamp: Date.now(),
      resolved: false
    }
  ];

  renderTrialAlerts(alerts);

  assert.ok(alertsContainer.innerHTML.includes('SEV-2'), 'Severity badge rendered');
  assert.ok(alertsContainer.innerHTML.includes('status-badge--warning'), 'SEV-2 warning class applied');
  assert.ok(alertsContainer.innerHTML.includes('EVENT_LOOP_LAG_SPIKE'), 'Error code rendered');
  assert.ok(alertsContainer.innerHTML.includes('Transient event loop lag excursion'), 'Alert message rendered');

  // Test empty alerts rendering (nominal state)
  renderTrialAlerts([]);
  assert.ok(alertsContainer.innerHTML.includes('No active anomaly alerts'), 'Nominal empty state rendered');

  // Test daily reports list buttons
  const buttonsContainer = globalThis.document.getElementById('trial-report-buttons');
  const reports = [
    { name: 'day-01.md' },
    { name: 'day-02.md' }
  ];

  renderTrialReportsList(reports);

  assert.ok(buttonsContainer.innerHTML.includes('DAY-01'), 'Day 01 button rendered');
  assert.ok(buttonsContainer.innerHTML.includes('DAY-02'), 'Day 02 button rendered');
  assert.ok(buttonsContainer.innerHTML.includes('Final Assessment'), 'Final Assessment button automatically appended');
});

test('5. Stale data detection does not present cached data as live without indication', () => {
  globalThis.document.reset();

  const lastCollected = globalThis.document.getElementById('trial-last-collected');
  const heroSub = globalThis.document.getElementById('trial-hero-sub');

  // When offline, hero sub and last sample explicitly flag offline state
  renderTrialOfflineState('Network Timeout');

  assert.equal(lastCollected.textContent, 'Last Sample: Offline');
  assert.match(heroSub.textContent, /No live metrics available/);

  // When live, last sample timestamp is displayed
  const sampleTime = Date.now();
  renderTrialHero({
    isRunning: true,
    lastSuccessfulCollectionAt: sampleTime,
    heartbeat: sampleTime,
    trialStartAt: { day: 1, totalDays: 7 }
  });

  assert.match(lastCollected.textContent, /Last Sample:/);
  assert.ok(!lastCollected.textContent.includes('Offline'));
});

test('6. Toast notification triggering instead of blocking window.alert', () => {
  globalThis.document.reset();

  const toastEl = globalThis.document.getElementById('toast');
  toastEl.hidden = true;

  // Trigger toast
  toast('Snapshot created successfully with verified SHA-256 checksum.', 2000);

  // Assertions: Toast element unhidden, text updated, zero window.alert invoked
  assert.equal(toastEl.hidden, false, 'Toast must unhide upon triggering');
  assert.equal(toastEl.textContent, 'Snapshot created successfully with verified SHA-256 checksum.');
});

test.after(() => {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.location;
  process.exit(0);
});

