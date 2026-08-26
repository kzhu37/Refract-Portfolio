// Allows TypeScript to resolve *.module.css imports as a plain string-keyed object.
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
