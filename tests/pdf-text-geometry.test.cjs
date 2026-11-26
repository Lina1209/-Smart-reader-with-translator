'use strict';

const assert = require('node:assert/strict');
const {
  multiplyPdfMatrices,
  getPdfTextItemGeometry,
  inspectPdfTextContent
} = require('../lib/pdf-text-geometry.js');

const identity = [1, 0, 0, 1, 0, 0];
const baseItem = {
  str: 'Привет',
  dir: 'ltr',
  transform: [12, 0, 0, 12, 100, 200],
  width: 42,
  height: 12,
  fontName: 'g_font_1',
  hasEOL: true
};

assert.deepEqual(multiplyPdfMatrices(identity, identity), identity);
assert.deepEqual(multiplyPdfMatrices([2, 0, 0, 2, 10, 20], [1, 0, 0, 1, 3, 4]), [2, 0, 0, 2, 16, 28]);

const normal = getPdfTextItemGeometry(baseItem, identity);
assert.equal(normal.text, 'Привет');
assert.deepEqual(normal.baseline, { x: 100, y: 200 });
assert.equal(normal.advance, 504);
assert.equal(normal.height, 144);
assert.equal(normal.hasEOL, true);
assert.ok(Math.abs(normal.angleRadians) < 1e-10);

const scaled = getPdfTextItemGeometry(baseItem, [2, 0, 0, 2, 0, 0]);
assert.equal(scaled.baseline.x, 200);
assert.equal(scaled.advance, 1008);
assert.equal(scaled.height, 288);

const rotated = getPdfTextItemGeometry(baseItem, [0, 1, -1, 0, 300, 0]);
assert.ok(Math.abs(rotated.angleRadians - Math.PI / 2) < 1e-10);
assert.equal(rotated.baseline.x, 100);
assert.equal(rotated.baseline.y, 100);

const rtl = getPdfTextItemGeometry({ ...baseItem, dir: 'rtl' }, identity);
assert.equal(rtl.dir, 'rtl');

assert.equal(getPdfTextItemGeometry({ ...baseItem, width: 0 }, identity), null);
assert.equal(getPdfTextItemGeometry({ ...baseItem, transform: [1, 2] }, identity), null);
assert.equal(getPdfTextItemGeometry(baseItem, [1, 0, 0, 0, 0, 0]), null);
assert.equal(multiplyPdfMatrices([1, 2], identity), null);

const inspected = inspectPdfTextContent({
  items: [baseItem, { ...baseItem, str: '   ' }, { ...baseItem, width: NaN }]
}, identity);
assert.equal(inspected.textItems, 3);
assert.equal(inspected.accepted, 1);
assert.equal(inspected.rejected, 1);
assert.equal(inspected.hasUnmappedItems, true);
console.log('PDF.js text geometry tests passed (12 assertions groups).');
