# PDF font resource audit — diagnostic only

This read-only prototype inspects a resolved PDF font dictionary with pypdf. It does not encode replacement text, calculate glyph advances, or modify a PDF.

## Evidence collected

For simple fonts (for example Type1 and TrueType), the audit reports:
- subtype and BaseFont name;
- named Encoding or Encoding dictionary BaseEncoding;
- a sample/count of Differences glyph names;
- FirstChar and Widths array coverage;
- ToUnicode presence and a coarse count of mapping sections;
- embedded font program keys (FontFile, FontFile2, FontFile3).

For Type 0 fonts, it reports:
- named or stream Encoding CMap;
- a basic vertical-writing-mode marker in a CMap stream;
- descendant CID font subtype and BaseFont;
- DW and presence/size of W width data;
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
