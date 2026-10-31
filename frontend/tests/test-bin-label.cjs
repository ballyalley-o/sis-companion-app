const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, requireModule = () => { throw new Error('Unexpected dependency'); }) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, require: requireModule });
  return exports;
}
const layout = load('warehouseMap.ts');
const labels = load('label.ts', name => {
  assert.equal(name, '@/src/warehouseMap');
  return layout;
});
assert.equal(labels.labelAccent('SEC2-L1-B4'), layout.mapSections.find(s => s.code === 'SEC2').color);
assert.equal(labels.labelAccent('SEC4-L1-B8'), layout.mapSections.find(s => s.code === 'SEC4').color);
const qr = 'data:image/png;base64,AA==';
const html = labels.labelsHtml([
  { code: 'SEC2-L1-B4', title: 'BIN 4', data_uri: qr },
  { code: 'SEC1-L1-B1', title: '<img src=x onerror=alert(1)>', data_uri: qr },
]);
assert.equal((html.match(/class="l"/g) || []).length, 2);
assert.equal((html.match(/alt="Bin QR code"/g) || []).length, 2);
assert.ok(html.includes('@page { size: 100mm 30mm;'));
assert.ok(html.includes('SEC2</span>-L1-B4'));
assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
assert.ok(!html.includes('<img src=x'));
assert.equal(labels.LABEL_PT.height, 85);
console.log('Wide sticker print size, section colours, batch labels and safe custom titles passed.');
