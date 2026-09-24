// Lets Node (with native TypeScript type-stripping) import the app's pure TS
// modules, whose imports omit extensions the way Metro and Jest expect.
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    try {
      return await next(specifier, context);
    } catch (error) {
      const retryable = error?.code === 'ERR_MODULE_NOT_FOUND' || error?.code === 'ERR_UNSUPPORTED_DIR_IMPORT';
      if (!specifier.startsWith('.') || !retryable) throw error;
      for (const candidate of [specifier + '.ts', specifier + '/index.ts']) {
        try { return await next(candidate, context); } catch {}
      }
      throw error;
    }
  }
`));
