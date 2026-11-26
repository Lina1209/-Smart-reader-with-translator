# PDF font resource audit — diagnostic only

This read-only prototype inspects a resolved PDF font dictionary with pypdf. It does not encode replacement text, calculate glyph advances, or modify a PDF.

## Evidence collected

For simple fonts (for example Type1 and TrueType), the audit reports:
- subtype and BaseFont name;
- named Encoding or Encoding dictionary BaseEncoding;
- a sample/count of Differences glyph names;
- FirstChar and Widths array coverage, with exact simple-font width lookup where explicitly available;
- ToUnicode presence and a coarse count of mapping sections;
- embedded font program keys (FontFile, FontFile2, FontFile3).

For Type 0 fonts, it reports:
- named or stream Encoding CMap;
- a basic vertical-writing-mode marker in a CMap stream;
- descendant CID font subtype and BaseFont;
- DW and presence/size of W width data, with lookup for both legal W array forms (CID plus width array, and CID range plus shared width);
- CIDToGIDMap kind and stream length;
- descendant embedded font program keys;
- ToUnicode presence.

## Important limits

ToUnicode is used for text extraction and is not a reverse encoder. Simple-font Encoding/Differences, Type 0 Encoding CMaps, descendant CID widths, CIDToGIDMap, and the embedded font's actual subset glyph inventory are distinct layers. This prototype reports structural evidence only and does not fully parse any CMap or prove code-to-glyph coverage.

A present FontFile/FontFile2/FontFile3 does not prove that every translated glyph exists in the embedded subset. A width array does not prove the corresponding glyph mapping. Correct Arabic joining, Indic shaping, ligatures, combining marks and bidirectional layout require a shaping-aware adapter. Consequently every report keeps `rewrite_ready: false`.

## Tests

Run:

```sh
python -m unittest discover -s tests -p 'test_pdf_font_resource_audit.py' -v
```

The tests use generated Type1/WinAnsi, embedded subset TrueType with Russian/Kazakh text, predefined Type0/CID and Identity-H/CIDFontType2 fixtures, plus a deliberately incomplete font dictionary. They validate the diagnostic output only; they are not user-document tests and do not validate translated output.

CI runs this suite after the PDF text-state audit.

## Width lookup behavior

`lookup_simple_width(font, code)` returns an explicit `/Widths` value when the byte code falls inside `FirstChar..FirstChar+len(Widths)-1`. It may return `/FontDescriptor/MissingWidth` only as a clearly labelled fallback. It does not guess metrics for the standard 14 fonts. Out-of-range or missing metrics are reported as invalid or unknown.

`lookup_cid_width(descendant, cid)` supports both `/W` forms: a starting CID followed by an array of widths, and a starting/ending CID followed by one shared width. If no explicit range matches, it reports `/DW` as the default. Returned widths remain in font text-space units (normally 1000 units per em); font size, character/word spacing, horizontal scaling, glyph advances and text-matrix movement are not applied.

The tests check explicit simple-font widths, both CID `/W` forms, default `/DW`, invalid inputs, and unknown metrics. This still does not decode source character codes into CIDs or glyph IDs.
