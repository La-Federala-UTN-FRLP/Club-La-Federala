import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createServer } from 'vite';
import { validateHostingEnv } from '../config/hosting.js';

test('Hosting rechaza configuración incompleta y flags de desarrollo', () => {
  for (const base of [undefined, '/api', 'http://api.invalid/api', 'https://localhost/api',
    'https://api.invalid', 'https://api.invalid/api?key=example', 'https://user@api.invalid/api']) {
    assert.throws(() => validateHostingEnv({ VITE_API_BASE_URL: base }));
  }
  const env = { VITE_API_BASE_URL: 'https://api.invalid/api' };
  assert.doesNotThrow(() => validateHostingEnv(env));
  for (const flag of ['VITE_REPORTES_MOCK', 'VITE_AUTH_USE_MOCK', 'VITE_RBAC_DISABLE_UI']) {
    assert.throws(() => validateHostingEnv({ ...env, [flag]: 'true' }));
    assert.doesNotThrow(() => validateHostingEnv({ ...env, [flag]: 'false' }));
  }
});

test('Hosting sirve dist y resuelve rutas profundas sin rewrite de API', async () => {
  const config = JSON.parse(await readFile(new URL('../../firebase.json', import.meta.url)));
  assert.equal(config.hosting.public, 'frontend/dist');
  assert.deepEqual(config.hosting.rewrites, [{ source: '**', destination: '/index.html' }]);
  assert.equal(config.hosting.site, undefined);
  assert.equal(config.hosting.target, undefined);
});

test('Transporte real con fetch simulado, sin red ni datos de staging', async (t) => {
  const server = await createServer({
    configFile: false,
    envDir: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://api.invalid/api/'),
      'import.meta.env.VITE_API_BASE': JSON.stringify(''),
      'import.meta.env.VITE_AUTH_TOKEN_KEY': JSON.stringify('lf_token'),
      'import.meta.env.VITE_REPORTES_MOCK': JSON.stringify('false'),
    },
  });
  const original = { fetch: globalThis.fetch, window: globalThis.window, localStorage: globalThis.localStorage };
  const storage = new Map([['lf_token', 'test-token']]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    removeItem: (key) => storage.delete(key),
  };
  globalThis.window = { location: { href: '' } };
  let response;
  const calls = [];
  globalThis.fetch = async (...args) => { calls.push(args); return response; };
  try {
    const { http, buildApiUrl } = await server.ssrLoadModule('/src/lib/http/http.js');
    const { uploadArchivo, sustituirArchivo, getFileSignedUrl } = await server.ssrLoadModule('/src/lib/api/archivos.js');
    const { exportarReporte, REPORTES_EN_MOCK } = await server.ssrLoadModule('/src/lib/api/reportes.js');

    await t.test('base /api sin doble barra y JSON con Bearer', async () => {
      assert.equal(buildApiUrl('/lotes'), 'https://api.invalid/api/lotes');
      response = new Response('{}');
      await http('/lotes', { method: 'POST', body: { tipo: 'ejemplo' } });
      const [url, options] = calls.at(-1);
      assert.equal(url, 'https://api.invalid/api/lotes');
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      assert.equal(options.body, '{"tipo":"ejemplo"}');
      assert.equal(options.credentials, undefined);
    });
    await t.test('alta y sustitución conservan FormData y boundary del navegador', async () => {
      response = new Response('{"data":{"id":1}}');
      await uploadArchivo(new Blob(['example']), 1, 'IMAGEN');
      let [url, options] = calls.at(-1);
      assert.equal(url, 'https://api.invalid/api/files');
      assert.ok(options.body instanceof FormData);
      assert.equal(options.body.get('idLoteAsociado'), '1');
      assert.equal(options.headers['Content-Type'], undefined);
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      response = new Response('{"data":{"id":2}}');
      await sustituirArchivo(1, new Blob(['replacement']));
      [url, options] = calls.at(-1);
      assert.equal(url, 'https://api.invalid/api/files/1/sustituir');
      assert.ok(options.body instanceof FormData);
      assert.equal(options.headers['Content-Type'], undefined);
    });
    await t.test('URL firmada usa el mismo transporte autenticado', async () => {
      response = new Response('{"signedUrl":"https://files.invalid/example"}');
      assert.equal(await getFileSignedUrl(1), 'https://files.invalid/example');
      assert.equal(calls.at(-1)[0], 'https://api.invalid/api/files/1/url');
      assert.equal(calls.at(-1)[1].body, '{}');
    });
    await t.test('403 preserva sesión y 401 multipart limpia token y redirige', async () => {
      response = new Response('{}', { status: 403 });
      assert.equal((await http('/lotes')).status, 403);
      assert.equal(storage.get('lf_token'), 'test-token');
      response = new Response('{}', { status: 401 });
      await assert.rejects(http('/files', { method: 'POST', body: new FormData() }), { status: 401 });
      assert.equal(storage.has('lf_token'), false);
      assert.equal(window.location.href, '/login');
    });
    await t.test('exportación conserva binario y rechaza HTML y error HTTP', async () => {
      assert.equal(REPORTES_EN_MOCK, false);
      response = new Response('example-binary', { headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="reporte.xlsx"',
      } });
      const result = await exportarReporte('inventario');
      assert.equal(await result.blob.text(), 'example-binary');
      assert.equal(result.nombre, 'reporte.xlsx');
      response = new Response('<html/>', { headers: { 'Content-Type': 'text/html' } });
      await assert.rejects(exportarReporte('inventario'), /Excel/);
      response = new Response('{}', { status: 403 });
      await assert.rejects(exportarReporte('inventario'), { statusCode: 403 });
    });
  } finally {
    Object.assign(globalThis, original);
    await server.close();
  }
});
