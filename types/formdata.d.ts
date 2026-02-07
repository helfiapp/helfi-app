// Some server-side environments (and their typings) can expose a FormData type
// that is missing the standard `get()`/`getAll()` methods at build time.
// We only use these methods in API routes, so this is a safe type augmentation.
declare global {
  interface FormData {
    get(name: string): any
    getAll(name: string): any[]
  }
}

export {}

