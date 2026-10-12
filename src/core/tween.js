// Timing primitives. Everything gameplay-related runs on the engine clock so that
// engine.timeScale (tests use 20–40×) speeds up animations, waits and cutscenes alike.

export const Ease = {
  linear: (k) => k,
  inSine: (k) => 1 - Math.cos((k * Math.PI) / 2),
  outSine: (k) => Math.sin((k * Math.PI) / 2),
  inOutSine: (k) => -(Math.cos(Math.PI * k) - 1) / 2,
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  },
  outElastic: (k) => {
    if (k === 0 || k === 1) return k;
    return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

const jobs = new Set();
let bound = false;

// Advance all running jobs by dt game-seconds. Called by the engine (or a viewer) every frame.
export function tick(dt) {
  const ms = dt * 1000;
  for (const job of [...jobs]) {
    job.elapsed += ms;
    const k = job.duration <= 0 ? 1 : Math.min(1, job.elapsed / job.duration);
    try {
      job.step(k);
    } catch (err) {
      jobs.delete(job);
      job.reject(err);
      continue;
    }
    if (k >= 1) {
      jobs.delete(job);
      job.resolve();
    }
  }
}

// Hook the tween system to anything exposing onUpdate(fn(dt)) — normally the Engine.
export function bindClock(engine) {
  if (bound) return;
  bound = true;
  engine.onUpdate((dt) => tick(dt));
}

function run(duration, step) {
  return new Promise((resolve, reject) => {
    jobs.add({ elapsed: 0, duration: Math.max(0, duration), step, resolve, reject });
  });
}

// Calls fn(easedK) every frame for `ms` game-milliseconds. Resolves when done.
export function animate(ms, fn, ease = Ease.inOutSine) {
  fn(ease(0));
  return run(ms, (k) => fn(ease(k)));
}

// Tweens numeric properties of obj towards `to`. Nested plain objects are supported one level
// deep, e.g. tween(mesh, { position: { y: 2 }, rotation: { z: 1 } }).
export function tween(obj, to, ms = 800, ease = Ease.inOutSine) {
  const tracks = [];
  for (const [key, val] of Object.entries(to)) {
    if (val !== null && typeof val === 'object') {
      const target = obj[key];
      for (const [k2, v2] of Object.entries(val)) tracks.push([target, k2, target[k2], v2]);
    } else {
      tracks.push([obj, key, obj[key], val]);
    }
  }
  return animate(ms, (k) => {
    for (const [o, k2, from, dest] of tracks) o[k2] = from + (dest - from) * k;
  }, ease);
}

export function wait(ms) {
  return run(ms, () => {});
}

// Cancel everything (used on chapter reset).
export function clearAll() {
  for (const job of jobs) job.resolve();
  jobs.clear();
}
