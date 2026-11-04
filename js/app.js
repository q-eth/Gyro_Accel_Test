'use strict';

const G = 9.80665;            // standard gravity, m/s²
const SPHERE_RANGE = 1.5;     // sphere radius in g
const DOT_RADIUS = 0.1;       // must match r of #dot in index.html
const TRAIL_LENGTH = 40;
const TEXT_INTERVAL_MS = 100; // numbers refresh at 10 Hz so they stay readable
const SMOOTHING = 0.35;       // low-pass factor for the dot, 1 = no smoothing

const $ = (id) => document.getElementById(id);

const state = {
  unit: loadPref('unit', 'g'),
  useYaw: loadPref('useYaw', '0') === '1',
  accel: null,   // accelerationIncludingGravity, m/s²
  rate: null,    // rotationRate, °/s
  orient: null,  // alpha/beta/gamma, °
  dot: { x: 0, y: 0, z: 0 },
  trail: [],
  eventCount: 0,
  started: false,
};

// ---------- preferences ----------

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem('gyroaccel.' + key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

function savePref(key, value) {
  try { localStorage.setItem('gyroaccel.' + key, value); } catch { /* storage unavailable */ }
}

// ---------- status ----------

function setStatus(kind, text) {
  $('status').dataset.state = kind;
  $('status-text').textContent = text;
}

function showStartPanel(message, showButton) {
  $('start-panel').hidden = false;
  $('start-message').innerHTML = message;
  $('start-btn').hidden = !showButton;
}

// ---------- sensor setup ----------

function needsPermission() {
  return (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') ||
         (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function');
}

async function requestPermissions() {
  // iOS 13+ only grants access from a user gesture, so both requests start in the same tap.
  const requests = [];
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    requests.push(DeviceMotionEvent.requestPermission());
  }
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    requests.push(DeviceOrientationEvent.requestPermission());
  }
  const results = await Promise.all(requests);
  return results.every((r) => r === 'granted');
}

// Listeners go on at page load: browsers without a permission prompt deliver data
// straight away, the others (iOS) start delivering once the user taps Start.
function listen() {
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('deviceorientation', onOrientation);
}

async function start() {
  if (state.started) return;

  if (needsPermission()) {
    try {
      if (!(await requestPermissions())) {
        setStatus('error', 'Permission denied');
        showStartPanel('Motion access was denied. On iPhone, close the tab, reopen the page and allow access, or enable it in <b>Settings → Safari → Motion &amp; Orientation Access</b>.', true);
        return;
      }
    } catch (err) {
      setStatus('error', 'Permission error');
      showStartPanel('Could not request sensor access: ' + err.message, true);
      return;
    }
  }

  state.started = true;
  if (!state.accel && !state.orient) setStatus('waiting', 'Waiting for data…');
  $('start-panel').hidden = true;

  setTimeout(() => {
    if (!state.accel && !state.orient) {
      setStatus('error', 'No sensor data');
      showStartPanel('No sensor data received. Open this page on a phone or tablet with an accelerometer and gyroscope. On a desktop you can simulate them in Chrome DevTools → <b>More tools → Sensors</b>.', false);
    }
  }, 3000);
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (a && a.x !== null) {
    state.accel = { x: a.x, y: a.y, z: a.z };
  }
  const r = e.rotationRate;
  if (r && r.alpha !== null) {
    state.rate = { alpha: r.alpha, beta: r.beta, gamma: r.gamma };
  }
  state.eventCount++;
  markLive();
}

function onOrientation(e) {
  if (e.beta === null && e.gamma === null) return;
  state.orient = { alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0 };
  markLive();
}

function markLive() {
  if ($('status').dataset.state !== 'live') {
    setStatus('live', 'Live');
    $('start-panel').hidden = true;
  }
}

// ---------- formatting ----------

function fmtSigned(v, digits) {
  const s = Math.abs(v).toFixed(digits);
  return (v < 0 ? '−' : '+') + s;
}

function fmtAccel(ms2) {
  return state.unit === 'g' ? fmtSigned(ms2 / G, 3) : fmtSigned(ms2, 2);
}

function unitLabel() {
  return state.unit === 'g' ? 'g' : 'm/s²';
}

// ---------- units ----------

function applyUnit(unit) {
  state.unit = unit;
  savePref('unit', unit);
  document.querySelectorAll('.segmented button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.unit === unit));
  });

  const label = unitLabel();
  document.querySelectorAll('.unit-label').forEach((el) => { el.textContent = label; });

  // ring and Z-bar labels sit at 0.5 g and 1 g
  if (unit === 'g') {
    $('ring-label-1').textContent = '1 g';
    $('ring-label-05').textContent = '0.5 g';
    $('zbar-label-pos').textContent = '+1 g';
    $('zbar-label-neg').textContent = '−1 g';
  } else {
    $('ring-label-1').textContent = G.toFixed(1) + ' m/s²';
    $('ring-label-05').textContent = (G / 2).toFixed(1) + ' m/s²';
    $('zbar-label-pos').textContent = '+' + G.toFixed(1);
    $('zbar-label-neg').textContent = '−' + G.toFixed(1);
  }
  updateText();
}

// ---------- rendering ----------

function updateText() {
  if (state.accel) {
    const { x, y, z } = state.accel;
    $('ax').textContent = fmtAccel(x);
    $('ay').textContent = fmtAccel(y);
    $('az').textContent = fmtAccel(z);
    const mag = Math.hypot(x, y, z);
    $('amag').textContent = state.unit === 'g' ? (mag / G).toFixed(3) : mag.toFixed(2);
  }
  if (state.orient) {
    const { alpha, beta, gamma } = state.orient;
    $('ox').textContent = fmtSigned(beta, 1) + '°';
    $('oy').textContent = fmtSigned(gamma, 1) + '°';
    $('oz').textContent = alpha.toFixed(1) + '°';
  }
  if (state.rate) {
    $('rx').textContent = fmtSigned(state.rate.beta, 1);
    $('ry').textContent = fmtSigned(state.rate.gamma, 1);
    $('rz').textContent = fmtSigned(state.rate.alpha, 1);
  }
}

function drawAccel() {
  const a = state.accel;
  const d = state.dot;
  d.x += (a.x / G - d.x) * SMOOTHING;
  d.y += (a.y / G - d.y) * SMOOTHING;
  d.z += (a.z / G - d.z) * SMOOTHING;

  // SVG y grows downward, device Y points to the top of the screen
  let px = d.x;
  let py = -d.y;
  const limit = SPHERE_RANGE - DOT_RADIUS;
  const len = Math.hypot(px, py);
  if (len > limit) {
    px *= limit / len;
    py *= limit / len;
  }

  const dot = $('dot');
  dot.setAttribute('cx', px.toFixed(4));
  dot.setAttribute('cy', py.toFixed(4));

  state.trail.push(px.toFixed(3) + ',' + py.toFixed(3));
  if (state.trail.length > TRAIL_LENGTH) state.trail.shift();
  $('trail').setAttribute('points', state.trail.join(' '));

  const zy = Math.max(-SPHERE_RANGE, Math.min(SPHERE_RANGE, -d.z));
  $('zbar-marker').setAttribute('cy', zy.toFixed(4));
  const fill = $('zbar-fill');
  fill.setAttribute('y', Math.min(0, zy).toFixed(4));
  fill.setAttribute('height', Math.abs(zy).toFixed(4));
}

function drawOrientation() {
  const { alpha, beta, gamma } = state.orient;
  const yaw = state.useYaw ? alpha : 0;
  // Device orientation is R = Rz(α)·Rx(β)·Ry(γ) in a right-handed frame (Z up).
  // CSS has Y pointing down, which flips the sign of rotations about X and Z.
  $('device').style.transform = `rotateZ(${-yaw}deg) rotateX(${-beta}deg) rotateY(${gamma}deg)`;
}

let lastText = 0;
function frame(t) {
  if (state.accel) drawAccel();
  if (state.orient) drawOrientation();
  if (t - lastText >= TEXT_INTERVAL_MS) {
    updateText();
    lastText = t;
  }
  requestAnimationFrame(frame);
}

setInterval(() => {
  $('rate-hz').textContent = state.eventCount ? state.eventCount + ' Hz' : '—';
  state.eventCount = 0;
}, 1000);

// ---------- init ----------

document.querySelectorAll('.segmented button').forEach((b) => {
  b.addEventListener('click', () => applyUnit(b.dataset.unit));
});

const yawToggle = $('yaw-toggle');
yawToggle.checked = state.useYaw;
yawToggle.addEventListener('change', () => {
  state.useYaw = yawToggle.checked;
  savePref('useYaw', state.useYaw ? '1' : '0');
});

$('start-btn').addEventListener('click', start);

applyUnit(state.unit === 'ms2' ? 'ms2' : 'g');
requestAnimationFrame(frame);

if (!window.isSecureContext) {
  setStatus('error', 'HTTPS required');
  showStartPanel('Motion sensors only work over <b>HTTPS</b>. Open the GitHub Pages address (https://…) instead of a local file or plain http.', false);
} else if (typeof DeviceMotionEvent === 'undefined' && typeof DeviceOrientationEvent === 'undefined') {
  setStatus('error', 'Not supported');
  showStartPanel('This browser does not support motion sensor events.', false);
} else {
  listen();
  if (needsPermission()) {
    setStatus('idle', 'Tap Start');
  } else {
    start();
  }
}
