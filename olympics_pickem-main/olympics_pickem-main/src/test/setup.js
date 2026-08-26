import '@testing-library/jest-dom'

// Mock fetch globally for tests
global.fetch = vi.fn()

// Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})
