import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => { cleanup(); localStorage.clear(); history.replaceState({}, '', '/') })

class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = ResizeObserver
