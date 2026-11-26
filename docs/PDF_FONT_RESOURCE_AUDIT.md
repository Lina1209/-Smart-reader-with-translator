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


## ToUnicode CMap parser (read-only)

tests/pdf_tounicode_cmap.py adds a conservative parser for the two common Unicode mapping operators:
- beginbfchar / endbfchar pairs;
- beginbfrange / endbfrange with either a sequential destination string or an explicit destination array.

Destination strings are decoded as UTF-16BE, including surrogate pairs. Source codes are retained as byte-hex keys; odd-length PDF hex strings are padded according to PDF hex-string rules. Duplicate source codes, malformed UTF-16, malformed entries and excessive range expansion are reported as errors rather than silently accepted. Default limits are 100,000 mappings and 4,096 entries per range.

The tests cover single mappings, supplementary Unicode, scalar ranges, destination arrays, comments, odd hex nibbles, malformed UTF-16, duplicate entries, unsupported sections and expansion limits.

This parser does not parse codespace ranges or the font's source Encoding CMap, and it does not connect source character codes to CIDs, glyph IDs or embedded subset glyphs. A ToUnicode map remains an extraction map, not a reverse encoder. It is diagnostic only and is not integrated into PDF rewriting.


## Encoding CMap parser (read-only)

tests/pdf_encoding_cmap.py parses embedded Encoding CMap sections:
- codespacerange: accepted byte lengths and source-code intervals;
- cidchar: individual source-code to CID mappings;
- cidrange: sequential source-code ranges mapped to sequential CIDs.

The parser preserves source codes as byte-hex keys, checks codespace membership when codespaces are declared, rejects duplicate mappings and invalid ranges, and caps expansion at 4,096 entries per range by default (100,000 mappings overall). Predefined named CMaps such as Identity-H are intentionally reported as unsupported rather than guessed.

CID is not a glyph ID. This module does not resolve UseCMap inheritance, predefined CMaps, CIDToGIDMap streams, embedded subset glyphs or glyph outlines. It is diagnostic only and is not integrated into PDF rewriting. CI runs seven focused tests for codespace lengths, cidchar, cidrange, mismatches, duplicates, malformed ranges and expansion limits.


## CIDToGIDMap lookup (read-only)

The font audit module now includes lookup_cid_to_gid(mapping, cid, descendant_subtype). For CIDFontType2 it distinguishes the PDF default identity mapping (when /CIDToGIDMap is absent), explicit /Identity, and a two-byte big-endian stream. It rejects negative or over-16-bit CIDs, odd-length streams, unreadable/empty streams and CIDs beyond the stream's available entries. CIDFontType0 is reported as not applicable rather than interpreted using the Type2 rule.

Tests cover identity/default, explicit GID extraction, multiple entries, odd stream length, out-of-range CID, invalid CID and non-Type2 descendants. This only resolves one CID-to-GID lookup. It does not inspect the embedded font's glyph table or prove that the GID has a usable outline, nor does it prove that the translated character can be shaped or encoded in the font.


## Joined Type 0 character mapping chain

tests/pdf_character_mapping_audit.py joins already-parsed reports for one source character code: source bytes -> ToUnicode text and Encoding CMap CID -> CIDToGIDMap GID (for CIDFontType2 only). It distinguishes missing CID, missing Unicode, invalid source codes and unavailable/out-of-range GID evidence. The six tests cover an explicit mapping, identity default, missing links, out-of-range GID, CIDFontType0 and invalid source-code input.

This is a report-joining adapter, not a parser for a complete PDF font resource. The maps are joined only when their source-code byte keys match. A mapped GID still does not prove an actual usable glyph outline, nor does it establish that arbitrary translated text can be encoded or shaped with that font. CI runs this test suite independently.


## Embedded TrueType glyph outline audit (read-only)

tests/pdf_truetype_glyph_audit.py adds a bounded fontTools-based inspection for embedded TrueType programs (FontFile2 / glyf+loca). Given a resolved GID, it checks whether the GID exists in the font's glyph order, reports the glyph name and number of contours, distinguishes simple outlines, composite outlines and empty glyphs, walks composite components with depth/component limits, and reports Unicode cmap scalars associated with the glyph name.

The tests inspect a real DejaVu Sans font program embedded in a generated PDF, including GID 36 from the CIDToGIDMap fixture, plus a simple letter, a composite accented letter and the empty space glyph. Invalid font data and out-of-range GIDs fail closed. CI installs fontTools and runs this suite independently.

This adapter supports TrueType glyf/loca outlines only. It does not inspect CFF/OpenType-CFF, Type 1 or CIDFontType0 outlines. A structurally present outline does not prove that PDF clipping, text state, shaping, color/alpha, layout or translated-text fit are safe. The Unicode cmap is supporting font evidence; PDF source-code/Encoding/ToUnicode mappings remain separate.
