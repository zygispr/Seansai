import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

/** Every module the Vercel entrypoint loads through src/main.ts (which starts a server itself). */
const mainImports = [
  ...readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8').matchAll(
    /from '(\.\/[^']+)'/g,
  ),
].map(([, path = '']) => path.replace('./', './src/'));

/**
 * Vercel's function loader cannot `require()` an ES module, which Node itself allows. Run with that
 * disabled, the API must still load and answer, as it does on Vercel (where the web app is its own
 * service, so the server is built without it).
 */
test('the API starts without require() of ES modules, as on Vercel', () => {
  const script = `
    for (const path of ${JSON.stringify(mainImports)}) await import(path);
    const { openDb } = await import('./src/db/index.ts');
    const { buildServer } = await import('./src/server.ts');
    const app = buildServer({ db: await openDb(':memory:'), now: () => new Date(), webDistDir: null });
    // Over real HTTP, as main.ts serves it: app.inject() loads a test-only library.
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    const response = await fetch(url + '/api/v1/health');
    console.log('HEALTH_STATUS=' + response.status);
    await app.close();
  `;
  const result = spawnSync(
    process.execPath,
    ['--no-experimental-require-module', '--input-type=module', '-e', script],
    { cwd: fileURLToPath(new URL('../..', import.meta.url)), encoding: 'utf8' },
  );

  expect(result.stderr).not.toContain('ERR_REQUIRE_ESM');
  expect(result.stdout).toContain('HEALTH_STATUS=200');
});
