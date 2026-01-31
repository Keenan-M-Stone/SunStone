export function bitReverseIndices(n: number) {
  const bits = Math.log2(n)
  const rev: number[] = new Array(n)
  for (let i = 0; i < n; i += 1) {
    let x = i
    let y = 0
    for (let b = 0; b < bits; b += 1) {
      y = (y << 1) | (x & 1)
      x >>= 1
    }
    rev[i] = y
  }
  return rev
}

export function fftTransform(real: number[], imag: number[]) {
  const n = real.length
  if ((n & (n - 1)) !== 0) throw new Error('fftTransform requires power-of-two length')
  const rev = bitReverseIndices(n)
  for (let i = 0; i < n; i += 1) {
    const j = rev[i]
    if (j > i) {
      const tr = real[i]; real[i] = real[j]; real[j] = tr
      const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlen_r = Math.cos(ang)
    const wlen_i = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wr = 1
      let wi = 0
      for (let j = 0; j < (len >> 1); j += 1) {
        const u_r = real[i + j]
        const u_i = imag[i + j]
        const v_r = real[i + j + (len >> 1)] * wr - imag[i + j + (len >> 1)] * wi
        const v_i = real[i + j + (len >> 1)] * wi + imag[i + j + (len >> 1)] * wr
        real[i + j] = u_r + v_r
        imag[i + j] = u_i + v_i
        real[i + j + (len >> 1)] = u_r - v_r
        imag[i + j + (len >> 1)] = u_i - v_i
        const nxt_wr = wr * wlen_r - wi * wlen_i
        const nxt_wi = wr * wlen_i + wi * wlen_r
        wr = nxt_wr
        wi = nxt_wi
      }
    }
  }
}

export function computeFFT(times: number[], values: number[]) {
  const orig_n = values.length
  if (orig_n < 2) return { freqs: [], mags: [] }
  const maxN = 1024
  const n = Math.min(maxN, 1 << Math.floor(Math.log2(orig_n)))
  if (n < 2) return { freqs: [], mags: [] }
  const re = new Array(n).fill(0)
  const im = new Array(n).fill(0)
  for (let i = 0; i < n; i += 1) re[i] = values[i]
  try {
    fftTransform(re, im)
  } catch (err) {
    return { freqs: [], mags: [] }
  }
  const dt = (times[times.length - 1] - times[0]) / Math.max(1, times.length - 1)
  const freqs: number[] = []
  const mags: number[] = []
  for (let k = 0; k < n / 2; k += 1) {
    const m = Math.hypot(re[k], im[k]) / n
    freqs.push(k / (n * dt))
    mags.push(m)
  }
  return { freqs, mags }
}