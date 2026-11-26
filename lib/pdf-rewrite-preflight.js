'use strict';

/**
 * Conservative preflight for a future native PDF text-stream rewrite.
 *
 * This module DOES NOT edit PDF bytes. It decides whether a single PDF.js
 * text item is safe enough to hand to a separately tested font/content-stream
 * adapter. Unknown font coverage, geometry, bidi direction or encoding always
 * falls back instead of guessing.
 */

function reject(reason, details = {}) {
  return { ok: false, action: 'fallback', reason, ...details };
}

function planPdfTextReplacement(input) {
  if (!input || typeof input !== 'object') return reject('invalid-input');

  const originalText = String(input.originalText ?? '');
  const translatedText = String(input.translatedText ?? '');
  const item = input.textItem;
  const font = input.fontAdapter;

  if (!originalText.trim() || !translatedText.trim()) return reject('empty-text');
  if (/[\r\n]/.test(translatedText)) return reject('multi-line-replacement');
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
  if (!font || typeof font.hasGlyph !== 'function' ||
      typeof font.encode !== 'function' || typeof font.measure !== 'function') {
    return reject('font-adapter-incomplete');
  }

  // Never infer glyph support from a font family name or from PDF.js metadata.
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

  // Allow a small rounding tolerance, but never silently squeeze text below
  // 78% of its nominal size. A future layout-aware engine may reflow instead.
  const scale = item.width / measuredWidth;
  if (scale < 0.78) return reject('replacement-does-not-fit', { scale });
  const fontScale = Math.min(1, scale);
  return {
    ok: true,
    action: 'eligible-for-rewrite-adapter',
    originalText,
    translatedText,
    fontName: item.fontName,
    fontScale,
    encodedBytes: encoded,
    bounds: { width: item.width, height: item.height },
    warning: 'Preflight only: no PDF content stream has been changed.'
  };
}

module.exports = { planPdfTextReplacement };
