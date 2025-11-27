// Minimal type declaration to satisfy TypeScript for the 'web-push' package
// The runtime is JavaScript; we only need loose typings here.
declare module 'web-push' {
  const webpush: any;
  export default webpush;
}


