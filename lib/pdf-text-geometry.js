'use strict';

/*
 * Geometry-only adapter for PDF.js TextItem records.
 * It deliberately does not claim that a glyph can be encoded in the source font.
 */

function multiplyPdfMatrices(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 6 || b.length !== 6 ||
      ![...a, ...b].every(Number.isFinite)) return null;
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5]
  ];
}

function getPdfTextItemGeometry(item, viewportTransform) {
  if (!item || !Array.isArray(item.transform) || item.transform.length !== 6 ||
      !item.transform.every(Number.isFinite) ||
      !Array.isArray(viewportTransform) || viewportTransform.length !== 6 ||
      !viewportTransform.every(Number.isFinite)) return null;

  const width = Number(item.width);
  const height = Number(item.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const transform = multiplyPdfMatrices(viewportTransform, item.transform);
  if (!transform) return null;

  const axisX = Math.hypot(transform[0], transform[1]);
  const axisY = Math.hypot(transform[2], transform[3]);
  if (!Number.isFinite(axisX) || !Number.isFinite(axisY) || axisX < 1e-8 || axisY < 1e-8) return null;

  const angle = Math.atan2(transform[1], transform[0]);
  const advance = width * axisX;
  const glyphHeight = height * axisY;
  if (![angle, advance, glyphHeight].every(Number.isFinite) || advance <= 0 || glyphHeight <= 0) return null;

  // PDF.js text transforms describe the baseline origin. This adapter preserves
  // the transformed basis and does not invent a rectangular glyph bounding box.
  return {
    text: String(item.str || ''),
    fontName: typeof item.fontName === 'string' ? item.fontName : '',
    dir: item.dir === 'rtl' ? 'rtl' : item.dir === 'ltr' ? 'ltr' : 'unknown',
    baseline: { x: transform[4], y: transform[5] },
    basis: {
      x: { x: transform[0], y: transform[1] },
      y: { x: transform[2], y: transform[3] }
    },
    advance,
    height: glyphHeight,
    angleRadians: angle,
    hasEOL: item.hasEOL === true,
    widthScale: axisX,
    heightScale: axisY
  };
}

function inspectPdfTextContent(textContent, viewportTransform) {
  const items = textContent && Array.isArray(textContent.items) ? textContent.items : [];
  const fragments = [];
  let rejected = 0;
  for (const item of items) {
    if (!String(item && item.str || '').trim()) continue;
    const geometry = getPdfTextItemGeometry(item, viewportTransform);
    if (geometry) fragments.push(geometry);
    else rejected++;
  }
  return {
    fragments,
    rejected,
    textItems: items.length,
    accepted: fragments.length,
    hasUnmappedItems: rejected > 0
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { multiplyPdfMatrices, getPdfTextItemGeometry, inspectPdfTextContent };
}
