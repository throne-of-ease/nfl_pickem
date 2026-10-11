import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => { cleanup(); globalThis.localStorage?.clear(); globalThis.sessionStorage?.clear(); globalThis.history?.replaceState({}, '', '/') })

class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
global.ResizeObserver = ResizeObserver
