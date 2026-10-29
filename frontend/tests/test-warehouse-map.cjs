const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/warehouseMap.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const helpers = {};
new Function('exports', output)(helpers);
const { baysOnLevel, locateBin, mapSections, rackOffset } = helpers;
for (const section of mapSections) {
  for (let level = 1; level <= section.levels; level++) {
    const expected = section.code === 'SEC4' && level <= 2 ? 8 : section.bays;
    assert.equal(baysOnLevel(section, level), expected);
    assert.ok(locateBin(`${section.code}-L${level}-B${expected}`));
    assert.equal(locateBin(`${section.code}-L${level}-B${expected + 1}`), null);
  }
}
for (const code of ['QLD-A01', 'SEC2-L3-B1', 'SEC4-L1-B9', 'SEC4-L2-B14', 'SEC1-L0-B1', null]) assert.equal(locateBin(code), null);
assert.equal(locateBin(' sec3-l4-b12 ').code, 'SEC3-L4-B12');
assert.ok(rackOffset('SEC1-L1-B15', 350) > rackOffset('SEC1-L1-B1', 350));
assert.ok(rackOffset('SEC4-L1-B1', 350) > rackOffset('SEC4-L3-B1', 350));
assert.equal(rackOffset('unmapped', 350), 0);
console.log('Warehouse section boundaries, SEC4 level counts and target scrolling passed.');
