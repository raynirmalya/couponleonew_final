// The blog snapshot is read only by the Analog server load function.
declare module 'node:fs/promises' {
  export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
