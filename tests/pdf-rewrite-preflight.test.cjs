'use strict';

const assert = require('node:assert/strict');
const { planPdfTextReplacement } = require('../lib/pdf-rewrite-preflight');

const geometry = {
  dir: 'ltr',
  transform: [12, 0, 0, 12, 72, 700],
  width: 180,
  height: 12,
  fontName: 'F1'
};
function adapter(options = {}) {
  const missing = new Set(options.missing || []);
  return {
    hasGlyph: character => !missing.has(character),
    encode: text => new TextEncoder().encode(text),
    measure: text => options.measure ?? text.length * 7
  };
}
function plan(translatedText, options = {}) {
  return planPdfTextReplacement({
    originalText: 'Source text',
    translatedText,
    textItem: options.geometry || geometry,
    fontAdapter: options.font === undefined ? adapter(options) : options.font
  });
}

assert.equal(plan('Переведённый текст').ok, true, 'Cyrillic must pass when the supplied font adapter confirms every glyph');
assert.equal(plan('Қазақша мәтін').ok, true, 'Kazakh-specific letters must be checked through actual font coverage');
assert.equal(plan('Mixed Latin и кириллица').ok, true, 'Mixed scripts may pass only with complete glyph coverage');
assert.equal(plan('العربية', { geometry: { ...geometry, dir: 'rtl' } }).reason, 'unsupported-text-direction');
assert.equal(plan('漢字', { missing: ['漢'] }).reason, 'missing-glyph');
assert.equal(plan('A very long translated sentence', { measure: 400 }).reason, 'replacement-does-not-fit');
assert.equal(plan('line one\nline two').reason, 'multi-line-replacement');
assert.equal(plan('Text', { geometry: { ...geometry, width: 0 } }).reason, 'invalid-text-bounds');
assert.equal(plan('Text', { font: null }).reason, 'font-adapter-incomplete');

const eligible = plan('Bonjour');
assert.equal(eligible.action, 'eligible-for-rewrite-adapter');
assert.ok(eligible.encodedBytes instanceof Uint8Array);
assert.match(eligible.warning, /Preflight only/);

console.log('PDF rewrite preflight: all synthetic safety checks passed.');
