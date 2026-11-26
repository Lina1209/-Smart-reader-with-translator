# PDF native text-rewrite prototype — safety gate

Status: **isolated preflight prototype only; not connected to the document translator**.

The current PDF workflow uses PDF.js for extraction and pdf-lib for page assembly. pdf-lib does not provide a high-level API for replacing arbitrary existing text operators. This prototype deliberately does not attempt to mutate PDF content streams.

## What the preflight now requires

`lib/pdf-rewrite-preflight.js` accepts one PDF.js-like text item, a font adapter and an independently verified rewrite context. It only returns a candidate for a separate rewrite adapter when all of the following are explicitly confirmed:

- valid text transform, positive extracted dimensions and a font resource name;
- left-to-right horizontal writing and a single-line replacement;
- embedded source font program, source encoding, Unicode mapping, glyph mapping and target glyph coverage;
- shaping/cluster support, not merely per-character glyph presence;
- resolved text state, clipping and transparency, with the replacement proven to fit the available clipped width;
- top-level page content (nested Form XObject editing is not supported by this gate);
- unsigned, untagged document structure;
- a font adapter with verified encoding and measured metrics.

Missing facts cause a named fallback. PDF.js `TextItem.width` is an extracted text advance, **not** a clipping bound; the gate therefore requires a separately calculated `rewriteContext.availableWidth`. The measured target width must come from a verified font-metrics adapter. A font family name or PDF.js style metadata is not proof of embedded glyph availability.

The result action is `candidate-for-independent-rewrite-adapter`, not permission to mutate a PDF. Encoded bytes are only adapter output; they are not asserted to be valid bytes for the source PDF font's encoding. This module does not edit, save or rewrite any PDF.

## Synthetic checks

Run:

```sh
node tests/pdf-rewrite-preflight.test.cjs
```

The tests exercise Cyrillic, Kazakh letters, mixed scripts, missing glyphs, RTL fallback, line breaks, malformed geometry, unverified font metrics/encoding, and fail-closed behavior for every required graphics/font fact, vertical writing, nested forms, signatures, tagged structure and unknown available width.

These are synthetic unit tests of the safety gate. They are not tests against actual embedded fonts, browser PDF.js replacement, real user documents or translated PDF output. In particular, the booleans in test fixtures are simulated evidence; production code must derive them from a real PDF object/content-stream analysis and a real shaping/font adapter.

## Why the source-font checks are separate

PDF text extraction commonly exposes a Unicode string through a `ToUnicode` CMap, but that does not by itself identify how to encode replacement bytes. A simple font's character code is interpreted through its font Encoding and Differences; a Type 0 font uses a CMap to map character codes to CIDs, then a descendant font and often a `CIDToGIDMap` to reach glyph IDs. The embedded subset may omit characters that exist in the full font family. Therefore:

- `ToUnicode` supports text extraction; it is not a reverse encoder.
- Encoding CMap and `CIDToGIDMap` solve different mapping stages.
- A glyph being present in a font family does not prove it exists in the embedded subset.
- Per-codepoint coverage does not prove correct shaping of ligatures, combining sequences, Arabic joining or Indic clusters.

A real adapter must inspect the actual font program and PDF mappings, shape the full translated run, and encode through the exact source-font path—or embed a new font and update all relevant PDF resources/operators. The latter is a separate, substantially larger engineering task.

## Synthetic PDF fixture and rendering gates

GitHub Actions generates temporary PDF files with ReportLab and inspects them with pypdf. The fixtures cover:

- a simple Type1 / WinAnsi page;
- an embedded subset TrueType page containing Russian, all tested Kazakh-specific letters and accented Latin;
- a predefined Type0/CID page using `UniJIS-UCS2-H`;
- a hand-built Type0/CIDFontType2 page using `Identity-H`, an embedded TrueType font, a `ToUnicode` CMap, explicit widths and a binary `CIDToGIDMap`;
- a page combining selectable table text, vector rules and a rotated text run;
- a separate text page with a `TJ` kerning array and non-default character spacing, word spacing, horizontal scaling and text rise;
- nested Form XObjects with independent resource dictionaries, nested `Do` invocations, per-form matrices and clipping paths;
- an RGB image XObject with a grayscale soft mask, an alpha/blend graphics state, clipping and selectable text over the image.

The tests inspect font resources selected by `Tf`, embedded font programs, explicit Kazakh Unicode mappings, Type 0 descendant fonts, CID widths, CID-to-glyph mapping bytes, `TJ` members and text-state operators, nested Form XObject resource references, form matrices, `Do` invocations, clipping operators, image XObjects and `/SMask` relationships, graphics-state alpha/blend settings, and extracted text.

A separate Poppler-based regression renders an eight-page suite before and after a no-op pypdf read/write round trip at 96 DPI, checks page dimensions and pixel differences, and extracts word boxes to check stable text/order/coordinates. Fixture-specific assertions check word boxes against page, table and image bounds. These tests validate parsing and no-op serialization stability; they do not test translation or fidelity of rewritten content. The nested-form fixture does not calculate complete device-space clip intersections, and the transparency fixture does not prove future rewrite compositing fidelity. A production walker still needs bounded recursive resource resolution, graphics-state save/restore, matrix composition, clipping intersections and exact text-state interpretation.

## PDF.js text geometry adapter

`lib/pdf-text-geometry.js` composes each PDF.js text item's six-value transform with the page viewport transform. It records the transformed baseline, text basis vectors, advance, height, rotation, direction and end-of-line marker. Invalid or degenerate transforms are rejected and counted.

The adapter intentionally does not infer exact glyph outlines, source-font encodings, glyph IDs, clipping paths or precise glyph bounds. PDF.js text geometry helps locate text runs but does not establish safe native replacement.

No production PDF pipeline is connected to this prototype. Unsupported cases must continue to use the existing disclosed OCR/raster fallback or remain unchanged; no native rewrite should be integrated until an actual content-stream adapter passes independent extraction and visual regression tests.


## Content-stream text-state audit (diagnostic only)

`tests/pdf_content_stream_audit.py` inspects operators already parsed by pypdf and records text-show events (`Tj`, `TJ`, quote operators) with the active text-state values: font resource name, font size, character spacing, word spacing, horizontal scaling, leading, rise and render mode. It also counts text-matrix operators, clipping operators, Form XObject invocations and checks basic `q`/`Q` and `BT`/`ET` balance.

This deliberately does **not** calculate glyph advances or resulting text matrices after `Tj`/`TJ`: that requires the exact font encoding, widths, writing mode and character-code interpretation. It also does not resolve inherited resources, recursive Form XObjects, transformed clipping intersections or transparency. The report is evidence for the next implementation step, not an eligibility proof and not a content-stream editor.

Run the new checks with:

```sh
python -m unittest discover -s tests -p 'test_pdf_content_stream_audit.py' -v
```


## Related font diagnostics

See [PDF font resource audit](PDF_FONT_RESOURCE_AUDIT.md) for the read-only inspection of simple-font encodings, Type 0/CID mappings, widths, embedded font programs and CID-to-GID evidence. This remains diagnostic only and does not enable native PDF rewriting.


## PDF text/obstacle rectangle intersection diagnostic

`tests/pdf_layout_overlap.py` provides a small geometry primitive for comparing a text-run rectangle with explicitly supplied obstacle rectangles. It validates finite positive rectangles, computes exact axis-aligned intersection area, treats edge-touching as non-overlap, and returns separate `overlap`, `clear`, `incomplete` and `invalid-input` states. Invalid obstacle geometry is never silently treated as clear.

The unit tests cover disjoint boxes, edge contact, partial and full containment overlap, multiple obstacles, malformed rectangles and fail-closed behavior. CI runs the suite independently.

This is intentionally not a PDF object walker: it does not discover image/table/shape bounds, compose Form XObject or viewport matrices, resolve clipping paths, rotation, transparency, z-order or blend modes. Its inputs must already be transformed into a common page-space coordinate system. A reported intersection is a geometric warning, not proof of visible obstruction. No text is moved and no PDF is rewritten.
