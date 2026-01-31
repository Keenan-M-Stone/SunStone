import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.*'],
    environment: 'jsdom',
    globals: true,
    setupFiles: 'src/__tests__/setupTests.ts'
  }
})