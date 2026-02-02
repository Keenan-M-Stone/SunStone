import '@testing-library/jest-dom'
import React from 'react'

// make React available globally in tests for older JSX transforms
;(globalThis as any).React = React

// Provide a minimal canvas/getContext shim so tests and components that attempt to access
// canvas contexts (2D or lightweight WebGL checks) won't throw in JSDOM. This keeps tests
// low-risk and avoids installing heavy native deps like `canvas` in CI/dev.
if (typeof HTMLCanvasElement !== 'undefined') {
  const proto = (HTMLCanvasElement.prototype as any)
  if (!proto.getContext || /not-implemented/i.test(String(proto.getContext))) {
    proto.getContext = function (type?: string) {
      // Basic 2D context stub (sufficient for our MaterialEditor gradient drawing tests)
      if (type === '2d') {
        return {
          clearRect: () => {},
          createLinearGradient: () => ({ addColorStop: (_: number, __: string) => {} }),
          fillRect: () => {},
          fillStyle: '',
          getImageData: () => ({ data: new Uint8ClampedArray(0) }),
          putImageData: () => {},
          measureText: () => ({ width: 0 }),
        }
      }
      // Return a minimal object for WebGL contexts to avoid throwing if code checks for it.
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        return {
          getExtension: () => null,
          createShader: () => ({}),
          createProgram: () => ({}),
        }
      }
      return null
    }
  }
}

// any other global test setup can go here
