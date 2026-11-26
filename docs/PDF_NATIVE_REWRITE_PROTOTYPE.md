# PDF native text-rewrite prototype — safety gate

Status: **isolated preflight prototype only; not connected to the document translator**.

The current PDF workflow uses PDF.js for extraction and pdf-lib for page assembly. pdf-lib does not provide a high-level API for replacing arbitrary existing text operators. This prototype deliberately does not attempt to mutate PDF content streams.

## What the prototype checks

`lib/pdf-rewrite-preflight.js` accepts one PDF.js-like text item and a font adapter supplied by a future engine. It allows a rewrite candidate only when:

- the item has a valid six-number text transform, positive width/height and a font resource name;
- the text direction is left-to-right (RTL and vertical text safely fall back for now);
- the adapter explicitly confirms every translated character exists in the target font;
- encoding returns bytes and text measurement succeeds;
- the replacement fits without shrinking below 78% of nominal size;
- the replacement remains a single line.

Unknown or unsupported cases return a named fallback reason. The function returns encoded bytes for a later adapter but **does not edit, save or rewrite any PDF**.

## Synthetic checks

Run:

```sh
node tests/pdf-rewrite-preflight.test.cjs
```

The test covers Cyrillic, Kazakh letters, mixed Latin/Cyrillic, missing glyphs, RTL fallback, multi-line text, invalid geometry, incomplete font adapters and overflow.

These are unit tests of the safety gate, not tests against real PDF files or real embedded fonts. They do not prove that a PDF content-stream rewrite will preserve kerning, ligatures, character spacing, clipping paths, transparency, tagged structure, signatures or searchable text.

## Next engineering gate

Before integration, a real content-stream adapter must be designed and tested against synthetic PDFs generated with:
- WinAnsi simple fonts;
- embedded subset TrueType fonts with ToUnicode CMaps;
- Type0/CID fonts and Identity-H;
- non-embedded fonts;
- mixed text and vector table rules;
- ligatures, kerning, TJ arrays, rotated text and clipped text.

The adapter must re-open each output with PDF.js and verify that the old text is gone, the replacement is extractable, and unrelated images/vectors remain unchanged. Unsupported pages must remain unchanged or use the disclosed OCR fallback. No third-party engine with an incompatible license is bundled by this prototype.

## Real PDF fixture gate

GitHub Actions generates temporary PDF files with ReportLab and inspects them with pypdf. The fixtures cover:

- a simple Type1 / WinAnsi page;
- an embedded subset TrueType page containing Russian, all tested Kazakh-specific letters and accented Latin;
- a predefined Type0/CID page using `UniJIS-UCS2-H`;
- a hand-built Type0/CIDFontType2 page using `Identity-H`, an embedded TrueType font, a `ToUnicode` CMap, explicit widths and a binary `CIDToGIDMap`;
- a page combining selectable table text, vector rules and a rotated text run;
- a separate text page with a `TJ` kerning array and non-default character spacing, word spacing, horizontal scaling and text rise.

The tests inspect the font resources actually selected by each page's `Tf` operators, embedded font programs, the explicit Kazakh Unicode mappings, Type0 descendant fonts, CID widths, CID-to-glyph mapping bytes, `TJ` array members and text-state operators, extracted text and content-stream operators. This avoids treating unused font entries in a shared ReportLab resource dictionary as fonts used by a page.

The ReportLab Type0 fixture uses a predefined Japanese Unicode CMap and a CIDFontType0 descendant with explicit widths. A second hand-built PDF fixture exercises Identity-H, an embedded CIDFontType2 TrueType program, a ToUnicode mapping and a binary CIDToGIDMap stream. The latter validates one known CID-to-glyph mapping; it is not a broad font-shaping or rendering test.

The PDF files are generated during CI and are not committed as binary fixtures. This is a real-PDF parsing and fixture-validation step, not a text-rewrite test. It does not yet use PDF.js, replace text operators, or prove visual equivalence after translation. No production PDF pipeline is connected to this prototype.

## PDF.js text geometry adapter

A browser-loadable helper now composes each PDF.js text item's six-value transform with the page viewport transform. It records the transformed baseline, text basis vectors, advance, height, rotation, direction and end-of-line marker. Invalid or degenerate transforms are rejected and counted.

The adapter intentionally does not infer exact glyph outlines, source-font encodings, glyph IDs, clipping paths or a precise glyph bounding box. PDF.js text item geometry is useful for locating text runs, but it is not sufficient evidence that translated glyphs can be safely encoded into an existing embedded font. The helper is loaded by the app and has Node regression tests for scaling, rotation, RTL metadata, EOL and malformed inputs.

This is still geometry inspection only. No PDF content stream is edited, and no visual or real-document replacement test is claimed.
