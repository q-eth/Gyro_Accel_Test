'use strict';

const G = 9.80665;            // standard gravity, m/s²
const SPHERE_RANGE = 3;       // sphere edge and Z bar end, in g
const SVG_RADIUS = 1.5;       // sphere radius in SVG units (index.html)
const SVG_PER_G = SVG_RADIUS / SPHERE_RANGE;
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
  // diagnostics shown when no data arrives
  motionEvents: 0,
  motionEmpty: 0,
  orientEvents: 0,
  orientEmpty: 0,
  permission: 'не запрашивалось',
};

const NO_DATA_TIMEOUT_MS = 4000;

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

function showStartPanel(message, showButton, buttonText = 'Старт') {
  $('start-panel').hidden = false;
  $('start-message').innerHTML = message;
  $('start-btn').hidden = !showButton;
  $('start-btn').textContent = buttonText;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function diagnostics() {
  return '<br><small class="diag">Диагностика: движение — ' + state.motionEvents + ' событий (пустых: ' + state.motionEmpty +
    '), ориентация — ' + state.orientEvents + ' (пустых: ' + state.orientEmpty + '); разрешение: ' + escapeHtml(state.permission) +
    '; ' + escapeHtml(navigator.userAgent) + '</small>';
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
  state.permission = results.join(', ');
  return results.every((r) => r === 'granted');
}

// Listeners go on at page load so browsers without a permission prompt deliver data
// straight away. After a grant they are attached again: Chrome does not restart a sensor
// subscription that was made before permission was given.
function listen() {
  for (const [type, handler] of [['devicemotion', onMotion], ['deviceorientation', onOrientation], ['deviceorientationabsolute', onOrientation]]) {
    window.removeEventListener(type, handler);
    window.addEventListener(type, handler);
  }
}

async function start() {
  if (state.started) return;

  if (needsPermission()) {
    try {
      if (!(await requestPermissions())) {
        setStatus('error', 'Доступ запрещён');
        showStartPanel('Доступ к датчикам движения запрещён. На iPhone закройте вкладку, откройте страницу заново и разрешите доступ, либо включите его в <b>Настройках → Safari</b> (доступ к движению и ориентации).', true);
        return;
      }
    } catch (err) {
      setStatus('error', 'Ошибка доступа');
      showStartPanel('Не удалось запросить доступ к датчикам: ' + err.message, true);
      return;
    }
  }

  state.started = true;
  listen();
  if (!state.accel && !state.orient) setStatus('waiting', 'Ожидание данных…');
  $('start-panel').hidden = true;

  setTimeout(() => {
    if (state.accel || state.orient) return;
    state.started = false;
    setStatus('error', 'Нет данных');
    const gotEmpty = state.motionEmpty + state.orientEmpty > 0;
    const message = gotEmpty
      ? 'Браузер присылает события датчиков, но без значений — скорее всего, доступ заблокирован в настройках сайта. ' +
        'В Chrome нажмите на значок слева от адреса → <b>Разрешения</b> (или <b>⋮ → Настройки → Настройки сайтов → Датчики движения</b>) и разрешите доступ для этого сайта, затем обновите страницу.'
      : 'Данные с датчиков не поступают. Проверьте, что в <b>⋮ → Настройки → Настройки сайтов → Датчики движения</b> доступ разрешён, ' +
        'и что в быстрых настройках Android не включена плитка «Датчики выкл.» (Sensors off). На компьютере датчики можно имитировать в инструментах разработчика Chrome: <b>Дополнительные инструменты → Датчики</b>.';
    showStartPanel(message + diagnostics(), true, 'Повторить');
  }, NO_DATA_TIMEOUT_MS);
}

function onMotion(e) {
  state.motionEvents++;
  const a = e.accelerationIncludingGravity;
  const r = e.rotationRate;
  const hasAccel = a && a.x !== null;
  const hasRate = r && r.alpha !== null;
  if (!hasAccel && !hasRate) {
    state.motionEmpty++;
    return;
  }
  if (hasAccel) state.accel = { x: a.x, y: a.y, z: a.z };
  if (hasRate) state.rate = { alpha: r.alpha, beta: r.beta, gamma: r.gamma };
  state.eventCount++;
  markLive();
}

function onOrientation(e) {
  state.orientEvents++;
  if (e.beta === null && e.gamma === null) {
    state.orientEmpty++;
    return;
  }
  // the absolute variant is only a fallback for browsers that send nothing on the relative one
  if (e.type === 'deviceorientation') state.hasRelative = true;
  else if (state.hasRelative) return;
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
  return state.unit === 'g' ? 'g' : 'м/с²';
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

  // scale labels carry their value in g; Z-bar labels are signed and, in м/с², have no unit to save space
  document.querySelectorAll('[data-g]').forEach((el) => {
    const g = Number(el.dataset.g);
    const isBar = el.hasAttribute('data-bar');
    const sign = isBar ? (g < 0 ? '−' : '+') : '';
    const value = unit === 'g' ? Math.abs(g) + ' g' : (Math.abs(g) * G).toFixed(1) + (isBar ? '' : ' м/с²');
    el.textContent = sign + value;
  });
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
  let px = d.x * SVG_PER_G;
  let py = -d.y * SVG_PER_G;
  const limit = SVG_RADIUS - DOT_RADIUS;
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

  const zy = Math.max(-SVG_RADIUS, Math.min(SVG_RADIUS, -d.z * SVG_PER_G));
  $('zbar-marker').setAttribute('cy', zy.toFixed(4));
  const fill = $('zbar-fill');
  fill.setAttribute('y', Math.min(0, zy).toFixed(4));
  fill.setAttribute('height', Math.abs(zy).toFixed(4));
}

// ---------- orientation math ----------
// Quaternions are [w, x, y, z] in the right-handed world frame (X east, Y north, Z up).

function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

function qnormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  return n < 1e-9 ? [1, 0, 0, 0] : q.map((v) => v / n);
}

// Device orientation is R = Rz(α)·Rx(β)·Ry(γ).
function eulerToQuat(alpha, beta, gamma) {
  const h = Math.PI / 360; // degrees → half-angle radians
  const qz = [Math.cos(alpha * h), 0, 0, Math.sin(alpha * h)];
  const qx = [Math.cos(beta * h), Math.sin(beta * h), 0, 0];
  const qy = [Math.cos(gamma * h), 0, Math.sin(gamma * h), 0];
  return qmul(qmul(qz, qx), qy);
}

// Swing-twist split q = twist·swing, twist about the world vertical. Dropping the twist removes
// heading without the Euler-angle jumps that happen when the phone stands perpendicular to the floor.
function removeHeading(q) {
  const twist = qnormalize([q[0], 0, 0, q[3]]);
  return qmul([twist[0], 0, 0, -twist[3]], q);
}

// Rotation matrix for CSS, whose Y axis points down: M·R·M with M = diag(1, −1, 1).
function quatToCssMatrix([w, x, y, z]) {
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - w * z), r02 = 2 * (x * z + w * y);
  const r10 = 2 * (x * y + w * z), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - w * x);
  const r20 = 2 * (x * z - w * y), r21 = 2 * (y * z + w * x), r22 = 1 - 2 * (x * x + y * y);
  // matrix3d is column-major
  const m = [r00, -r10, r20, 0, -r01, r11, -r21, 0, r02, -r12, r22, 0, 0, 0, 0, 1];
  return 'matrix3d(' + m.map((v) => v.toFixed(6)).join(',') + ')';
}

function drawOrientation() {
  const { alpha, beta, gamma } = state.orient;
  let target = eulerToQuat(alpha, beta, gamma);
  if (!state.useYaw) target = removeHeading(target);

  // q and −q are the same rotation: blend toward the nearer one
  let q = state.viewQuat || target;
  const dot = q[0] * target[0] + q[1] * target[1] + q[2] * target[2] + q[3] * target[3];
  if (dot < 0) target = target.map((v) => -v);
  q = qnormalize(q.map((v, i) => v + (target[i] - v) * SMOOTHING));
  state.viewQuat = q;

  $('device').style.transform = quatToCssMatrix(q);
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
  $('rate-hz').textContent = state.eventCount ? state.eventCount + ' Гц' : '—';
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
  setStatus('error', 'Нужен HTTPS');
  showStartPanel('Датчики движения работают только по <b>HTTPS</b>. Откройте адрес GitHub Pages (https://…), а не локальный файл или страницу по http.', false);
} else if (typeof DeviceMotionEvent === 'undefined' && typeof DeviceOrientationEvent === 'undefined') {
  setStatus('error', 'Не поддерживается');
  showStartPanel('Этот браузер не поддерживает события датчиков движения.', false);
} else {
  listen();
  if (needsPermission()) {
    setStatus('idle', 'Нажмите «Старт»');
  } else {
    start();
  }
}
