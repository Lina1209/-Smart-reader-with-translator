'use strict';

const assert = require('node:assert/strict');
const { planPdfTextReplacement, REQUIRED_TRUE } = require('../lib/pdf-rewrite-preflight');

const geometry = {
  dir: 'ltr',
  transform: [12, 0, 0, 12, 72, 700],
  width: 180,
  height: 12,
  fontName: 'F1'
};
const safeContext = {
  writingMode: 0,
  formXObjectDepth: 0,
  signedDocument: false,
  taggedStructurePresent: false,
  availableWidth: 180
};
for (const fact of REQUIRED_TRUE) safeContext[fact] = true;

function adapter(options = {}) {
  const missing = new Set(options.missing || []);
  return {
    metricsVerified: options.metricsVerified !== false,
    encodingVerified: options.encodingVerified !== false,
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
    rewriteContext: options.context === undefined ? safeContext : options.context,
    fontAdapter: options.font === undefined ? adapter(options) : options.font
  });
}

assert.equal(plan('Переведённый текст').ok, true, 'Cyrillic passes only with explicit verified font/context evidence');
assert.equal(plan('Қазақша мәтін').ok, true, 'Kazakh-specific letters pass only with explicit coverage');
assert.equal(plan('Mixed Latin и кириллица').ok, true, 'Mixed scripts can be considered when coverage and shaping are verified');
assert.equal(plan('العربية', { geometry: { ...geometry, dir: 'rtl' } }).reason, 'unsupported-text-direction');
assert.equal(plan('漢字', { missing: ['漢'] }).reason, 'missing-glyph');
assert.equal(plan('A very long translated sentence', { measure: 400 }).reason, 'replacement-does-not-fit');
assert.equal(plan('line one\nline two').reason, 'multi-line-replacement');
assert.equal(plan('Text', { geometry: { ...geometry, width: 0 } }).reason, 'invalid-text-bounds');
assert.equal(plan('Text', { font: null }).reason, 'font-adapter-incomplete-or-unverified');
assert.equal(plan('Text', { context: null }).reason, 'missing-rewrite-context');

for (const fact of REQUIRED_TRUE) {
  const context = { ...safeContext, [fact]: false };
  assert.equal(plan('Text', { context }).reason, 'unverified-' + fact, fact + ' must be explicitly verified');
}
assert.equal(plan('Text', { context: { ...safeContext, writingMode: 1 } }).reason, 'unsupported-writing-mode');
assert.equal(plan('Text', { context: { ...safeContext, formXObjectDepth: 1 } }).reason, 'nested-form-context-not-supported');
assert.equal(plan('Text', { context: { ...safeContext, signedDocument: true } }).reason, 'signed-document');
assert.equal(plan('Text', { context: { ...safeContext, taggedStructurePresent: true } }).reason, 'tagged-pdf-structure-not-preserved');
assert.equal(plan('Text', { context: { ...safeContext, availableWidth: null } }).reason, 'unknown-available-width');
assert.equal(plan('Text', { metricsVerified: false }).reason, 'font-adapter-incomplete-or-unverified');
assert.equal(plan('Text', { encodingVerified: false }).reason, 'font-adapter-incomplete-or-unverified');

const eligible = plan('Bonjour');
assert.equal(eligible.action, 'candidate-for-independent-rewrite-adapter');
assert.ok(eligible.encodedBytes instanceof Uint8Array);
assert.match(eligible.warning, /no PDF content stream has been changed/);
assert.equal(eligible.bounds.availableWidth, 180);

console.log('PDF rewrite preflight: all conservative synthetic safety checks passed.');
