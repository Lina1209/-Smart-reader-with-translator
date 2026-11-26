'use strict';

/**
 * Conservative eligibility gate for a future native PDF text rewrite.
 *
 * This module does not parse PDF objects or edit content streams. A caller
 * must supply independently verified source-font and graphics-context facts.
 * Missing facts always cause a fallback; PDF.js TextItem metadata alone is
 * never treated as proof of embedded-font encodability or safe placement.
 */

function reject(reason, details = {}) {
  return { ok: false, action: 'fallback', reason, ...details };
}

const REQUIRED_TRUE = [
  'fontProgramEmbedded',
  'sourceEncodingVerified',
  'unicodeMappingVerified',
  'glyphMappingVerified',
  'glyphCoverageVerified',
  'shapingVerified',
  'textStateResolved',
  'clipResolved',
  'clipAllowsReplacement',
  'transparencyResolved'
];

function planPdfTextReplacement(input) {
  if (!input || typeof input !== 'object') return reject('invalid-input');

  const originalText = String(input.originalText ?? '');
  const translatedText = String(input.translatedText ?? '');
  const item = input.textItem;
  const font = input.fontAdapter;
  const context = input.rewriteContext;

  if (!originalText.trim() || !translatedText.trim()) return reject('empty-text');
  if (/[\\r\\n]/.test(translatedText)) return reject('multi-line-replacement');
  if (!item || typeof item !== 'object') return reject('missing-text-geometry');
  if (item.dir !== 'ltr') return reject('unsupported-text-direction');
  if (!Array.isArray(item.transform) || item.transform.length !== 6 ||
      !item.transform.every(Number.isFinite)) return reject('invalid-transform');
  const [a, b, c, d] = item.transform;
  if (Math.hypot(a, b) < 0.001 || Math.hypot(c, d) < 0.001) {
    return reject('degenerate-transform');
  }
  if (!Number.isFinite(item.width) || item.width <= 0 ||
      !Number.isFinite(item.height) || item.height <= 0) {
    return reject('invalid-text-bounds');
  }
  if (typeof item.fontName !== 'string' || !item.fontName.trim()) {
    return reject('missing-font-reference');
  }

  if (!context || typeof context !== 'object') return reject('missing-rewrite-context');
  for (const fact of REQUIRED_TRUE) {
    if (context[fact] !== true) return reject('unverified-' + fact);
  }
  if (context.writingMode !== 0) return reject('unsupported-writing-mode');
  if (!Number.isInteger(context.formXObjectDepth) || context.formXObjectDepth !== 0) {
    return reject('nested-form-context-not-supported');
  }
  if (context.signedDocument === true) return reject('signed-document');
  if (context.taggedStructurePresent === true) return reject('tagged-pdf-structure-not-preserved');
  if (!Number.isFinite(context.availableWidth) || context.availableWidth <= 0) {
    return reject('unknown-available-width');
  }

  if (!font || typeof font.hasGlyph !== 'function' ||
      typeof font.encode !== 'function' || typeof font.measure !== 'function' ||
      font.metricsVerified !== true || font.encodingVerified !== true) {
    return reject('font-adapter-incomplete-or-unverified');
  }

  // Character coverage is necessary but not sufficient: shapingVerified above
  // must come from a real shaping/cluster check, not this per-character loop.
  for (const character of translatedText) {
    if (character.trim() && !font.hasGlyph(character)) {
      return reject('missing-glyph', { character });
    }
  }

  let encoded;
  let measuredWidth;
  try {
    encoded = font.encode(translatedText);
    measuredWidth = font.measure(translatedText, item.height);
  } catch (_) {
    return reject('font-encoding-or-measurement-failed');
  }
  if (!(encoded instanceof Uint8Array) || encoded.length === 0) {
    return reject('font-encoding-failed');
  }
  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
    return reject('invalid-measured-width');
  }

  // availableWidth must be computed by a separate layout/clip analysis.
  // TextItem.width is only an extracted advance; it is not a clipping bound.
  const scale = context.availableWidth / measuredWidth;
  if (scale < 0.78) return reject('replacement-does-not-fit', { scale });
  const fontScale = Math.min(1, scale);

  return {
    ok: true,
    action: 'candidate-for-independent-rewrite-adapter',
    originalText,
    translatedText,
    fontName: item.fontName,
    fontScale,
    encodedBytes: encoded,
    bounds: { availableWidth: context.availableWidth, textHeight: item.height },
    warning: 'Preflight only: encoding, font mapping and graphics context must be independently verified; no PDF content stream has been changed.'
  };
}

module.exports = { planPdfTextReplacement, REQUIRED_TRUE };
