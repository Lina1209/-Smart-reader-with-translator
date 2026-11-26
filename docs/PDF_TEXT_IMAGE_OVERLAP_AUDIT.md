# PDF text/image overlap audit — conservative diagnostic

`tests/pdf_text_image_overlap.py` joins caller-provided PDF.js text-item geometry with image placements emitted by `tests/pdf_image_placement.py`.

## What it reports
- Builds a text-item parallelogram from baseline, basis vectors, advance and height, retaining rotation/skew.
- Uses the image's Form-BBox-clipped polygon when that evidence is available (including an explicitly empty polygon for fully clipped images).
- Computes convex polygon intersection area and reports candidate text/image overlaps.
- Preserves incomplete evidence when arbitrary clipping paths or invalid text geometry remain unresolved.

## Limitations
This is not yet part of the browser translator. Inputs must be normalized into the same page coordinate space by an adapter. Text item geometry is not exact glyph outlines. Image placement is not proof of visible pixels or obstruction. Arbitrary clipping, transparency, z-order, blend modes and crop/rotation normalization are not resolved. The module does not move text, translate, or rewrite PDF files.

## Tests
Run:
```sh
python -m unittest discover -s tests -p 'test_pdf_text_image_overlap.py' -v
```
Synthetic tests cover rotated basis geometry, positive overlap, non-overlap, Form-BBox clipping, arbitrary-clipping uncertainty, invalid geometry and a fully clipped-image false-positive regression.
