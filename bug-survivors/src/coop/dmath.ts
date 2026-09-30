// Deterministic Math for co-op lockstep. Every client simulates the same world, so every sin/cos/atan2/pow must give
// the same bits on every JS engine (Chrome and the Android WebView are V8; Safari's JSC and Firefox differ in the last
// bit of their libm). These are fdlibm's algorithms written with + - * / and sqrt only (IEEE-exact everywhere), and
// installDetMath() swaps them into Math for the length of a co-op run. `**` isn't patchable: co-op code uses Math.pow.

const nat = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, asin: Math.asin, acos: Math.acos,
  exp: Math.exp, log: Math.log, pow: Math.pow, hypot: Math.hypot, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  log2: Math.log2, log10: Math.log10, cbrt: Math.cbrt, expm1: Math.expm1, log1p: Math.log1p,
};

// ---------------------------------------------------------------- sin / cos
const S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03, S3 = -1.98412698298579493134e-04,
  S4 = 2.75573137070700676789e-06, S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03, C3 = 2.48015872894767294178e-05,
  C4 = -2.75573143513906633035e-07, C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;
const INV_PIO2 = 6.36619772367581382433e-01;
const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;

function kSin(x: number) {
  const z = x * x, v = z * x;
  return x + v * (S1 + z * (S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)))));
}
function kCos(x: number) {
  const z = x * x;
  return 1 - 0.5 * z + z * z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
}
/** x = n * pi/2 + r, |r| <= pi/4. */
function reduce(x: number): [number, number] {
  const n = Math.floor(x * INV_PIO2 + 0.5);
  const r = (x - n * PIO2_1) - n * PIO2_1T;
  return [n, r];
}
export function dsin(x: number) {
  if (!Number.isFinite(x)) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kSin(x);
  const [n, r] = reduce(x);
  switch (((n % 4) + 4) % 4) {
    case 0: return kSin(r);
    case 1: return kCos(r);
    case 2: return -kSin(r);
    default: return -kCos(r);
  }
}
export function dcos(x: number) {
  if (!Number.isFinite(x)) return NaN;
  if (x > -0.7853981633974483 && x < 0.7853981633974483) return kCos(x);
  const [n, r] = reduce(x);
  switch (((n % 4) + 4) % 4) {
    case 0: return kCos(r);
    case 1: return -kSin(r);
    case 2: return -kCos(r);
    default: return kSin(r);
  }
}
export const dtan = (x: number) => dsin(x) / dcos(x);

// ---------------------------------------------------------------- atan / atan2
const ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01,
  9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02,
  4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];

export function datan(x0: number) {
  if (Number.isNaN(x0)) return NaN;
  const neg = x0 < 0 || Object.is(x0, -0);
  let x = neg ? -x0 : x0;
  if (x >= 7.378697629483821e19) return neg ? -ATANHI[3] - ATANLO[3] : ATANHI[3] + ATANLO[3];
  let id = -1;
  if (x < 0.4375) {
    if (x < 1e-29) return x0;
  } else if (x < 1.1875) {
    if (x < 0.6875) { id = 0; x = (2 * x - 1) / (2 + x); } else { id = 1; x = (x - 1) / (x + 1); }
  } else if (x < 2.4375) { id = 2; x = (x - 1.5) / (1 + 1.5 * x); } else { id = 3; x = -1 / x; }
  const z = x * x, w = z * z;
  const s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
  const s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
  if (id < 0) { const r = x - x * (s1 + s2); return neg ? -r : r; }
  const r = ATANHI[id] - ((x * (s1 + s2) - ATANLO[id]) - x);
  return neg ? -r : r;
}

const PI = 3.141592653589793, PI_LO = 1.2246467991473531772e-16;
export function datan2(y: number, x: number) {
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (y === 0) {
    if (x > 0 || (x === 0 && !Object.is(x, -0))) return y; // +-0
    return Object.is(y, -0) ? -PI : PI;
  }
  if (x === 0) return y > 0 ? PI / 2 : -PI / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return nat.atan2(y, x); // exact special values, same everywhere
  const a = datan(Math.abs(y / x));
  if (x > 0) return y > 0 ? a : -a;
  const r = PI - (a - PI_LO);
  return y > 0 ? r : -r;
}
export function dasin(x: number) {
  if (x > 1 || x < -1 || Number.isNaN(x)) return NaN;
  return datan2(x, Math.sqrt((1 - x) * (1 + x)));
}
export function dacos(x: number) {
  if (x > 1 || x < -1 || Number.isNaN(x)) return NaN;
  return datan2(Math.sqrt((1 - x) * (1 + x)), x);
}

// ---------------------------------------------------------------- exp / log / pow
const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
const P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
  P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08;
const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);
const LO = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 0 : 1, HI = 1 - LO;
/** 2^k for integer k in [-1022, 1023], built from its bits (exact). */
function pow2(k: number) {
  u32[LO] = 0;
  u32[HI] = ((k + 1023) << 20) >>> 0;
  return f64[0];
}
export function dexp(x: number) {
  if (Number.isNaN(x)) return NaN;
  if (x > 709.782712893384) return Infinity;
  if (x < -745.1332191019411) return 0;
  if (Math.abs(x) < 3.725290298461914e-9) return 1 + x;
  const k = Math.floor(x * INV_LN2 + 0.5);
  const hi = x - k * LN2_HI, lo = k * LN2_LO, r = hi - lo;
  const t = r * r, c = r - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  // Scale in two steps so a k near the edges can't overflow or go subnormal early.
  if (k > 1000) return y * pow2(1000) * pow2(k - 1000);
  if (k < -1000) return y * pow2(-1000) * pow2(k + 1000);
  return y * pow2(k);
}
const LG1 = 6.666666666666735130e-01, LG2 = 3.999999999940941908e-01, LG3 = 2.857142874366239149e-01,
  LG4 = 2.222219843214978396e-01, LG5 = 1.818357216161805012e-01, LG6 = 1.531383769920937332e-01, LG7 = 1.479819860511658591e-01;
export function dlog(x: number) {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  if (x < 2.2250738585072014e-308) { x *= 18014398509481984; k = -54; } // subnormal: scale up by 2^54
  f64[0] = x;
  let hx = u32[HI];
  k += (hx >>> 20) - 1023;
  hx &= 0x000fffff;
  // m in [sqrt(2)/2, sqrt(2)): normalise the mantissa's exponent to 0 or -1.
  const i = (hx + 0x95f64) & 0x100000;
  u32[HI] = hx | (i ^ 0x3ff00000);
  k += i >> 20;
  const f = f64[0] - 1;
  const s = f / (2 + f), z = s * s, w = z * z;
  const t1 = w * (LG2 + w * (LG4 + w * LG6)), t2 = z * (LG1 + w * (LG3 + w * (LG5 + w * LG7)));
  const R = t2 + t1, hfsq = 0.5 * f * f;
  return k * LN2_HI - ((hfsq - (s * (hfsq + R) + k * LN2_LO)) - f);
}
/** Integer powers by squaring (x**2 is exactly x*x); the rest via exp(y log x). */
export function dpow(x: number, y: number) {
  if (y === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return NaN;
  if (Number.isInteger(y) && Math.abs(y) <= 64) {
    let n = Math.abs(y), b = x, r = 1;
    while (n > 0) { if (n & 1) r *= b; b *= b; n >>= 1; }
    return y < 0 ? 1 / r : r;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return nat.pow(x, y);
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    if (!Number.isInteger(y)) return NaN;
    const r = dexp(y * dlog(-x));
    return y % 2 ? -r : r;
  }
  if (y === 0.5) return Math.sqrt(x);
  return dexp(y * dlog(x));
}
export function dhypot(...a: number[]) {
  if (a.length === 2) { const x = a[0], y = a[1]; return Math.sqrt(x * x + y * y); }
  let s = 0;
  for (const v of a) s += v * v;
  return Math.sqrt(s);
}
const dsinh = (x: number) => { const e = dexp(x); return (e - 1 / e) / 2; };
const dcosh = (x: number) => { const e = dexp(x); return (e + 1 / e) / 2; };
const dtanh = (x: number) => { if (x > 20) return 1; if (x < -20) return -1; const e = dexp(2 * x); return (e - 1) / (e + 1); };

let installed = 0;
/** Swap the deterministic versions into Math (nesting-safe); returns the undo. */
export function installDetMath() {
  if (installed++ === 0) {
    Object.assign(Math, {
      sin: dsin, cos: dcos, tan: dtan, atan: datan, atan2: datan2, asin: dasin, acos: dacos, exp: dexp, log: dlog, pow: dpow,
      hypot: dhypot, sinh: dsinh, cosh: dcosh, tanh: dtanh, log2: (x: number) => dlog(x) / 0.6931471805599453,
      log10: (x: number) => dlog(x) / 2.302585092994046, cbrt: (x: number) => (x < 0 ? -dpow(-x, 1 / 3) : dpow(x, 1 / 3)),
      expm1: (x: number) => dexp(x) - 1, log1p: (x: number) => dlog(1 + x),
    });
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--installed === 0) Object.assign(Math, nat);
  };
}

/** Native versions, for checks. */
export const nativeMath = nat;
