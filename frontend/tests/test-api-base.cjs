const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/api.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

async function main() {
  for (const [origin, expected] of [[undefined, '/api'], ['', '/api'], ['https://example.test/', 'https://example.test/api'], ['http://localhost:8000///', 'http://localhost:8000/api']]) {
    const exports = {};
    const requests = [];
    vm.runInNewContext(source, {
      exports,
      process: { env: { EXPO_PUBLIC_BACKEND_URL: origin } },
      require: name => name === 'react-native' ? { Platform: { OS: 'web' } } : { storage: {} },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      },
    });
    assert.equal(exports.BASE, expected);
    await exports.api('/auth/login', { method: 'POST', body: { email: 'test@example.test', password: 'test-only' } });
    assert.equal(requests[0].url, expected + '/auth/login');
    assert.equal(requests[0].options.method, 'POST');
    assert.equal(requests[0].options.headers['Content-Type'], 'application/json');
  }
  console.log('Login requests use the correct API URL for missing, blank and explicit backend origins.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
