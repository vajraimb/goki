import { mulberry32 } from "./rng";

/** OCANNL default init: centered uniform over [-0.25, 0.25). */
export function uniformInit(rng: () => number, n: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = rng() * 0.5 - 0.25;
  return a;
}

export function zeros(n: number): Float32Array {
  return new Float32Array(n);
}

export function matvecAdd(
  w: Float32Array,
  x: ArrayLike<number>,
  rows: number,
  cols: number,
  b: Float32Array,
  out: Float32Array,
) {
  for (let i = 0; i < rows; i++) {
    let s = b[i]!;
    const row = i * cols;
    for (let j = 0; j < cols; j++) s += w[row + j]! * x[j]!;
    out[i] = s;
  }
}

export function reluInPlace(x: Float32Array) {
  for (let i = 0; i < x.length; i++) if (x[i]! < 0) x[i] = 0;
}

export function bceWithLogits(z: number, y: number): number {
  const az = Math.abs(z);
  return Math.max(z, 0) - z * y + Math.log1p(Math.exp(-az));
}

export function sigmoid(z: number): number {
  if (z >= 0) {
    const e = Math.exp(-z);
    return 1 / (1 + e);
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

export interface MLP {
  in: number;
  h1: number;
  h2: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
  w3: Float32Array;
  b3: Float32Array;
}

export function makeMlp(rng: () => number, din: number, h1 = 64, h2 = 32): MLP {
  return {
    in: din,
    h1,
    h2,
    w1: uniformInit(rng, h1 * din),
    b1: uniformInit(rng, h1),
    w2: uniformInit(rng, h2 * h1),
    b2: uniformInit(rng, h2),
    w3: uniformInit(rng, h2),
    b3: uniformInit(rng, 1),
  };
}

export function mlpParamCount(m: MLP): number {
  return m.w1.length + m.b1.length + m.w2.length + m.b2.length + m.w3.length + m.b3.length;
}

export function mlpForward(m: MLP, x: ArrayLike<number>, scratch?: { h1: Float32Array; h2: Float32Array }) {
  const h1 = scratch?.h1 ?? new Float32Array(m.h1);
  const h2 = scratch?.h2 ?? new Float32Array(m.h2);
  matvecAdd(m.w1, x, m.h1, m.in, m.b1, h1);
  reluInPlace(h1);
  matvecAdd(m.w2, h1, m.h2, m.h1, m.b2, h2);
  reluInPlace(h2);
  let z = m.b3[0]!;
  for (let j = 0; j < m.h2; j++) z += m.w3[j]! * h2[j]!;
  return { z, h1, h2 };
}

/** One SGD step on a minibatch. Returns mean BCE. */
export function mlpSgdStep(
  m: MLP,
  xs: Float32Array[],
  ys: number[],
  idx: number[],
  lr: number,
  l2: number,
): number {
  const n = idx.length;
  const gW1 = zeros(m.w1.length);
  const gB1 = zeros(m.b1.length);
  const gW2 = zeros(m.w2.length);
  const gB2 = zeros(m.b2.length);
  const gW3 = zeros(m.w3.length);
  const gB3 = zeros(1);
  const h1 = new Float32Array(m.h1);
  const h2 = new Float32Array(m.h2);
  const pre1 = new Float32Array(m.h1);
  const pre2 = new Float32Array(m.h2);
  let loss = 0;

  for (const i of idx) {
    const x = xs[i]!;
    const y = ys[i]!;
    matvecAdd(m.w1, x, m.h1, m.in, m.b1, pre1);
    for (let k = 0; k < m.h1; k++) h1[k] = pre1[k]! > 0 ? pre1[k]! : 0;
    matvecAdd(m.w2, h1, m.h2, m.h1, m.b2, pre2);
    for (let k = 0; k < m.h2; k++) h2[k] = pre2[k]! > 0 ? pre2[k]! : 0;
    let z = m.b3[0]!;
    for (let j = 0; j < m.h2; j++) z += m.w3[j]! * h2[j]!;
    loss += bceWithLogits(z, y);
    const dz = sigmoid(z) - y;

    gB3[0]! += dz;
    for (let j = 0; j < m.h2; j++) gW3[j]! += dz * h2[j]!;

    const dh2 = new Float32Array(m.h2);
    for (let j = 0; j < m.h2; j++) dh2[j] = dz * m.w3[j]! * (pre2[j]! > 0 ? 1 : 0);
    for (let j = 0; j < m.h2; j++) {
      gB2[j]! += dh2[j]!;
      const row = j * m.h1;
      for (let k = 0; k < m.h1; k++) gW2[row + k]! += dh2[j]! * h1[k]!;
    }
    const dh1 = new Float32Array(m.h1);
    for (let k = 0; k < m.h1; k++) {
      let s = 0;
      for (let j = 0; j < m.h2; j++) s += m.w2[j * m.h1 + k]! * dh2[j]!;
      dh1[k] = s * (pre1[k]! > 0 ? 1 : 0);
    }
    for (let k = 0; k < m.h1; k++) {
      gB1[k]! += dh1[k]!;
      const row = k * m.in;
      for (let j = 0; j < m.in; j++) gW1[row + j]! += dh1[k]! * x[j]!;
    }
  }

  const scale = lr / n;
  const decay = 1 - lr * l2;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) w[i] = w[i]! * decay - scale * g[i]!;
  };
  apply(m.w1, gW1);
  apply(m.b1, gB1);
  apply(m.w2, gW2);
  apply(m.b2, gB2);
  apply(m.w3, gW3);
  apply(m.b3, gB3);
  return loss / n;
}

export function mlpMeanBce(m: MLP, xs: Float32Array[], ys: number[], idx: number[]): number {
  const scratch = { h1: new Float32Array(m.h1), h2: new Float32Array(m.h2) };
  let s = 0;
  for (const i of idx) s += bceWithLogits(mlpForward(m, xs[i]!, scratch).z, ys[i]!);
  return s / Math.max(idx.length, 1);
}

export function mlpProb(m: MLP, x: ArrayLike<number>): number {
  return sigmoid(mlpForward(m, x).z);
}

/** d logit / d x  — saliency for the workpaper. */
export function mlpSaliency(m: MLP, x: ArrayLike<number>): number[] {
  const { h1, h2 } = mlpForward(m, x);
  // reconstruct pre-activation signs from post-relu (0 means gated)
  const dH2 = new Float32Array(m.h2);
  for (let j = 0; j < m.h2; j++) dH2[j] = m.w3[j]! * (h2[j]! > 0 ? 1 : 0);
  const dH1 = new Float32Array(m.h1);
  for (let k = 0; k < m.h1; k++) {
    let s = 0;
    for (let j = 0; j < m.h2; j++) s += m.w2[j * m.h1 + k]! * dH2[j]!;
    dH1[k] = s * (h1[k]! > 0 ? 1 : 0);
  }
  const dx = new Array<number>(m.in).fill(0);
  for (let j = 0; j < m.in; j++) {
    let s = 0;
    for (let k = 0; k < m.h1; k++) s += m.w1[k * m.in + j]! * dH1[k]!;
    dx[j] = s * (x[j] as number);
  }
  return dx;
}

export interface AE {
  in: number;
  h: number;
  z: number;
  we1: Float32Array;
  be1: Float32Array;
  we2: Float32Array;
  be2: Float32Array;
  wd1: Float32Array;
  bd1: Float32Array;
  wd2: Float32Array;
  bd2: Float32Array;
}

export function makeAe(rng: () => number, din: number, h = 16, z = 8): AE {
  return {
    in: din,
    h,
    z,
    we1: uniformInit(rng, h * din),
    be1: uniformInit(rng, h),
    we2: uniformInit(rng, z * h),
    be2: uniformInit(rng, z),
    wd1: uniformInit(rng, h * z),
    bd1: uniformInit(rng, h),
    wd2: uniformInit(rng, din * h),
    bd2: uniformInit(rng, din),
  };
}

export function aeRecon(ae: AE, x: ArrayLike<number>): Float32Array {
  const h = new Float32Array(ae.h);
  const z = new Float32Array(ae.z);
  const h2 = new Float32Array(ae.h);
  const y = new Float32Array(ae.in);
  matvecAdd(ae.we1, x, ae.h, ae.in, ae.be1, h);
  reluInPlace(h);
  matvecAdd(ae.we2, h, ae.z, ae.h, ae.be2, z);
  reluInPlace(z);
  matvecAdd(ae.wd1, z, ae.h, ae.z, ae.bd1, h2);
  reluInPlace(h2);
  matvecAdd(ae.wd2, h2, ae.in, ae.h, ae.bd2, y);
  return y;
}

export function aeErr(ae: AE, x: ArrayLike<number>): number {
  const y = aeRecon(ae, x);
  let s = 0;
  for (let i = 0; i < ae.in; i++) {
    const d = y[i]! - (x[i] as number);
    s += d * d;
  }
  return s / ae.in;
}

export function aeSgdStep(ae: AE, xs: Float32Array[], idx: number[], lr: number): number {
  const n = idx.length;
  const gWe1 = zeros(ae.we1.length);
  const gBe1 = zeros(ae.be1.length);
  const gWe2 = zeros(ae.we2.length);
  const gBe2 = zeros(ae.be2.length);
  const gWd1 = zeros(ae.wd1.length);
  const gBd1 = zeros(ae.bd1.length);
  const gWd2 = zeros(ae.wd2.length);
  const gBd2 = zeros(ae.bd2.length);
  let loss = 0;

  const h = new Float32Array(ae.h);
  const z = new Float32Array(ae.z);
  const h2 = new Float32Array(ae.h);
  const y = new Float32Array(ae.in);
  const preH = new Float32Array(ae.h);
  const preZ = new Float32Array(ae.z);
  const preH2 = new Float32Array(ae.h);

  for (const i of idx) {
    const x = xs[i]!;
    matvecAdd(ae.we1, x, ae.h, ae.in, ae.be1, preH);
    for (let k = 0; k < ae.h; k++) h[k] = preH[k]! > 0 ? preH[k]! : 0;
    matvecAdd(ae.we2, h, ae.z, ae.h, ae.be2, preZ);
    for (let k = 0; k < ae.z; k++) z[k] = preZ[k]! > 0 ? preZ[k]! : 0;
    matvecAdd(ae.wd1, z, ae.h, ae.z, ae.bd1, preH2);
    for (let k = 0; k < ae.h; k++) h2[k] = preH2[k]! > 0 ? preH2[k]! : 0;
    matvecAdd(ae.wd2, h2, ae.in, ae.h, ae.bd2, y);

    const dY = new Float32Array(ae.in);
    let mse = 0;
    for (let j = 0; j < ae.in; j++) {
      const d = y[j]! - x[j]!;
      mse += d * d;
      dY[j] = (2 * d) / ae.in;
    }
    loss += mse / ae.in;

    for (let j = 0; j < ae.in; j++) {
      gBd2[j]! += dY[j]!;
      const row = j * ae.h;
      for (let k = 0; k < ae.h; k++) gWd2[row + k]! += dY[j]! * h2[k]!;
    }
    const dH2 = new Float32Array(ae.h);
    for (let k = 0; k < ae.h; k++) {
      let s = 0;
      for (let j = 0; j < ae.in; j++) s += ae.wd2[j * ae.h + k]! * dY[j]!;
      dH2[k] = s * (preH2[k]! > 0 ? 1 : 0);
    }
    for (let k = 0; k < ae.h; k++) {
      gBd1[k]! += dH2[k]!;
      const row = k * ae.z;
      for (let j = 0; j < ae.z; j++) gWd1[row + j]! += dH2[k]! * z[j]!;
    }
    const dZ = new Float32Array(ae.z);
    for (let j = 0; j < ae.z; j++) {
      let s = 0;
      for (let k = 0; k < ae.h; k++) s += ae.wd1[k * ae.z + j]! * dH2[k]!;
      dZ[j] = s * (preZ[j]! > 0 ? 1 : 0);
    }
    for (let j = 0; j < ae.z; j++) {
      gBe2[j]! += dZ[j]!;
      const row = j * ae.h;
      for (let k = 0; k < ae.h; k++) gWe2[row + k]! += dZ[j]! * h[k]!;
    }
    const dH = new Float32Array(ae.h);
    for (let k = 0; k < ae.h; k++) {
      let s = 0;
      for (let j = 0; j < ae.z; j++) s += ae.we2[j * ae.h + k]! * dZ[j]!;
      dH[k] = s * (preH[k]! > 0 ? 1 : 0);
    }
    for (let k = 0; k < ae.h; k++) {
      gBe1[k]! += dH[k]!;
      const row = k * ae.in;
      for (let j = 0; j < ae.in; j++) gWe1[row + j]! += dH[k]! * x[j]!;
    }
  }

  const scale = lr / n;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) w[i] = w[i]! - scale * g[i]!;
  };
  apply(ae.we1, gWe1); apply(ae.be1, gBe1);
  apply(ae.we2, gWe2); apply(ae.be2, gBe2);
  apply(ae.wd1, gWd1); apply(ae.bd1, gBd1);
  apply(ae.wd2, gWd2); apply(ae.bd2, gBd2);
  return loss / n;
}

export interface Regressor {
  in: number;
  h: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
}

export function makeReg(rng: () => number, din: number, h = 32): Regressor {
  return {
    in: din,
    h,
    w1: uniformInit(rng, h * din),
    b1: uniformInit(rng, h),
    w2: uniformInit(rng, h),
    b2: uniformInit(rng, 1),
  };
}

export function regForward(r: Regressor, x: ArrayLike<number>): { y: number; h: Float32Array; pre: Float32Array } {
  const pre = new Float32Array(r.h);
  const h = new Float32Array(r.h);
  matvecAdd(r.w1, x, r.h, r.in, r.b1, pre);
  for (let i = 0; i < r.h; i++) h[i] = pre[i]! > 0 ? pre[i]! : 0;
  let y = r.b2[0]!;
  for (let i = 0; i < r.h; i++) y += r.w2[i]! * h[i]!;
  return { y, h, pre };
}

export function regSgdStep(
  r: Regressor,
  xs: Float32Array[],
  ys: number[],
  idx: number[],
  lr: number,
): number {
  const n = idx.length;
  const gW1 = zeros(r.w1.length);
  const gB1 = zeros(r.b1.length);
  const gW2 = zeros(r.w2.length);
  const gB2 = zeros(1);
  let loss = 0;
  for (const i of idx) {
    const x = xs[i]!;
    const t = ys[i]!;
    const { y, h, pre } = regForward(r, x);
    const d = y - t;
    loss += d * d;
    const dy = (2 * d) / 1;
    gB2[0]! += dy;
    for (let k = 0; k < r.h; k++) gW2[k]! += dy * h[k]!;
    const dh = new Float32Array(r.h);
    for (let k = 0; k < r.h; k++) dh[k] = dy * r.w2[k]! * (pre[k]! > 0 ? 1 : 0);
    for (let k = 0; k < r.h; k++) {
      gB1[k]! += dh[k]!;
      const row = k * r.in;
      for (let j = 0; j < r.in; j++) gW1[row + j]! += dh[k]! * x[j]!;
    }
  }
  const scale = lr / n;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) w[i] = w[i]! - scale * g[i]!;
  };
  apply(r.w1, gW1); apply(r.b1, gB1); apply(r.w2, gW2); apply(r.b2, gB2);
  return loss / n;
}

export function checksum(parts: Float32Array[]): string {
  let h = 2166136261;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      const bits = Math.round(p[i]! * 1e6);
      h ^= bits;
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export { mulberry32 };

export interface SoftmaxNet {
  in: number;
  h: number;
  k: number;
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
}

export function makeSoftmax(rng: () => number, din: number, h: number, k: number): SoftmaxNet {
  return {
    in: din,
    h,
    k,
    w1: uniformInit(rng, h * din),
    b1: uniformInit(rng, h),
    w2: uniformInit(rng, k * h),
    b2: uniformInit(rng, k),
  };
}

export function softmaxParamCount(m: SoftmaxNet): number {
  return m.w1.length + m.b1.length + m.w2.length + m.b2.length;
}

export function softmaxForward(m: SoftmaxNet, x: ArrayLike<number>) {
  const pre = new Float32Array(m.h);
  const h = new Float32Array(m.h);
  matvecAdd(m.w1, x, m.h, m.in, m.b1, pre);
  for (let i = 0; i < m.h; i++) h[i] = pre[i]! > 0 ? pre[i]! : 0;
  const z = new Float32Array(m.k);
  matvecAdd(m.w2, h, m.k, m.h, m.b2, z);
  let max = -Infinity;
  for (let i = 0; i < m.k; i++) if (z[i]! > max) max = z[i]!;
  const p = new Float32Array(m.k);
  let sum = 0;
  for (let i = 0; i < m.k; i++) {
    p[i] = Math.exp(z[i]! - max);
    sum += p[i]!;
  }
  for (let i = 0; i < m.k; i++) p[i] = p[i]! / sum;
  return { pre, h, z, p };
}

export function softmaxArgmax(p: ArrayLike<number>): number {
  let b = 0;
  for (let i = 1; i < p.length; i++) if (p[i]! > p[b]!) b = i;
  return b;
}

export function softmaxSgdStep(
  m: SoftmaxNet,
  xs: Float32Array[],
  ys: number[],
  idx: number[],
  lr: number,
  l2: number,
): number {
  const n = idx.length;
  const gW1 = zeros(m.w1.length);
  const gB1 = zeros(m.b1.length);
  const gW2 = zeros(m.w2.length);
  const gB2 = zeros(m.b2.length);
  let loss = 0;
  for (const i of idx) {
    const x = xs[i]!;
    const y = ys[i]!;
    const { pre, h, p } = softmaxForward(m, x);
    loss += -Math.log(Math.max(p[y]!, 1e-8));
    const dz = new Float32Array(m.k);
    for (let k = 0; k < m.k; k++) dz[k] = p[k]! - (k === y ? 1 : 0);
    for (let k = 0; k < m.k; k++) {
      gB2[k]! += dz[k]!;
      const row = k * m.h;
      for (let j = 0; j < m.h; j++) gW2[row + j]! += dz[k]! * h[j]!;
    }
    const dh = new Float32Array(m.h);
    for (let j = 0; j < m.h; j++) {
      let s = 0;
      for (let k = 0; k < m.k; k++) s += m.w2[k * m.h + j]! * dz[k]!;
      dh[j] = s * (pre[j]! > 0 ? 1 : 0);
    }
    for (let j = 0; j < m.h; j++) {
      gB1[j]! += dh[j]!;
      const row = j * m.in;
      for (let t = 0; t < m.in; t++) gW1[row + t]! += dh[j]! * x[t]!;
    }
  }
  const scale = lr / n;
  const decay = 1 - lr * l2;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) w[i] = w[i]! * decay - scale * g[i]!;
  };
  apply(m.w1, gW1);
  apply(m.b1, gB1);
  apply(m.w2, gW2);
  apply(m.b2, gB2);
  return loss / n;
}

export function sigmoidKForward(m: SoftmaxNet, x: ArrayLike<number>) {
  const pre = new Float32Array(m.h);
  const h = new Float32Array(m.h);
  matvecAdd(m.w1, x, m.h, m.in, m.b1, pre);
  for (let i = 0; i < m.h; i++) h[i] = pre[i]! > 0 ? pre[i]! : 0;
  const z = new Float32Array(m.k);
  matvecAdd(m.w2, h, m.k, m.h, m.b2, z);
  const p = new Float32Array(m.k);
  for (let i = 0; i < m.k; i++) p[i] = sigmoid(z[i]!);
  return { pre, h, z, p };
}

/** Independent sigmoid BCE. ys[i] is a k-hot vector, not a class index. */
export function multiBceSgdStep(
  m: SoftmaxNet,
  xs: Float32Array[],
  ys: number[][],
  idx: number[],
  lr: number,
  l2: number,
): number {
  const n = idx.length;
  const gW1 = zeros(m.w1.length);
  const gB1 = zeros(m.b1.length);
  const gW2 = zeros(m.w2.length);
  const gB2 = zeros(m.b2.length);
  let loss = 0;
  for (const i of idx) {
    const x = xs[i]!;
    const y = ys[i]!;
    const { pre, h, z, p } = sigmoidKForward(m, x);
    const dz = new Float32Array(m.k);
    for (let k = 0; k < m.k; k++) {
      const t = y[k] ?? 0;
      loss += bceWithLogits(z[k]!, t);
      dz[k] = p[k]! - t;
    }
    for (let k = 0; k < m.k; k++) {
      gB2[k]! += dz[k]!;
      const row = k * m.h;
      for (let j = 0; j < m.h; j++) gW2[row + j]! += dz[k]! * h[j]!;
    }
    const dh = new Float32Array(m.h);
    for (let j = 0; j < m.h; j++) {
      let s = 0;
      for (let k = 0; k < m.k; k++) s += m.w2[k * m.h + j]! * dz[k]!;
      dh[j] = s * (pre[j]! > 0 ? 1 : 0);
    }
    for (let j = 0; j < m.h; j++) {
      gB1[j]! += dh[j]!;
      const row = j * m.in;
      for (let t = 0; t < m.in; t++) gW1[row + t]! += dh[j]! * x[t]!;
    }
  }
  const scale = lr / n;
  const decay = 1 - lr * l2;
  const apply = (w: Float32Array, g: Float32Array) => {
    for (let i = 0; i < w.length; i++) w[i] = w[i]! * decay - scale * g[i]!;
  };
  apply(m.w1, gW1);
  apply(m.b1, gB1);
  apply(m.w2, gW2);
  apply(m.b2, gB2);
  return loss / (n * m.k);
}

