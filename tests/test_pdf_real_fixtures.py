#!/usr/bin/env python3
"""Inspect generated PDFs with an independent parser; no PDF rewriting occurs."""
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, DecodedStreamObject, DictionaryObject, NameObject,
    NumberObject, TextStringObject,
)

from generate_pdf_fixtures import build_fixtures


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def page_fonts(page):
    resources = dereference(page["/Resources"])
    fonts = dereference(resources["/Font"])
    return {name: dereference(font) for name, font in fonts.items()}


def add_identity_h_cidfonttype2_fixture(path):
    """Build a minimal real PDF with Identity-H, ToUnicode and a CIDToGIDMap stream."""
    from generate_pdf_fixtures import _dejavu_path

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)

    def add_stream(data):
        item = DecodedStreamObject()
        item.set_data(data)
        return writer._add_object(item)

    font_program = Path(_dejavu_path()).read_bytes()
    font_program_ref = add_stream(font_program)
    descriptor = DictionaryObject({
        NameObject("/Type"): NameObject("/FontDescriptor"),
        NameObject("/FontName"): NameObject("/DejaVuSans"),
        NameObject("/Flags"): NumberObject(4),
        NameObject("/FontBBox"): ArrayObject([
            NumberObject(-1021), NumberObject(-463),
            NumberObject(1793), NumberObject(1233),
        ]),
        NameObject("/ItalicAngle"): NumberObject(0),
        NameObject("/Ascent"): NumberObject(760),
        NameObject("/Descent"): NumberObject(-240),
        NameObject("/CapHeight"): NumberObject(760),
        NameObject("/StemV"): NumberObject(80),
        NameObject("/FontFile2"): font_program_ref,
    })
    descriptor_ref = writer._add_object(descriptor)

    # CID 0 maps to .notdef; CID 1 maps to DejaVu Sans glyph 36 ("A").
    cid_to_gid_ref = add_stream(b"\\x00\\x00" + (36).to_bytes(2, "big"))
    cid_font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/CIDFontType2"),
        NameObject("/BaseFont"): NameObject("/DejaVuSans"),
        NameObject("/CIDSystemInfo"): DictionaryObject({
            NameObject("/Registry"): TextStringObject("Adobe"),
            NameObject("/Ordering"): TextStringObject("Identity"),
            NameObject("/Supplement"): NumberObject(0),
        }),
        NameObject("/FontDescriptor"): descriptor_ref,
        NameObject("/DW"): NumberObject(600),
        NameObject("/W"): ArrayObject([
            NumberObject(1), ArrayObject([NumberObject(667)]),
        ]),
        NameObject("/CIDToGIDMap"): cid_to_gid_ref,
    })
    cid_font_ref = writer._add_object(cid_font)

    unicode_cmap = b""" /CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Fixture-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfchar
<0001> <0041>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end"""
    type0_font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type0"),
        NameObject("/BaseFont"): NameObject("/DejaVuSans"),
        NameObject("/Encoding"): NameObject("/Identity-H"),
        NameObject("/DescendantFonts"): ArrayObject([cid_font_ref]),
        NameObject("/ToUnicode"): add_stream(unicode_cmap),
    })
    type0_ref = writer._add_object(type0_font)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F0"): type0_ref}),
    })
    page[NameObject("/Contents")] = add_stream(b"BT /F0 24 Tf 100 700 Td <0001> Tj ET")

    with Path(path).open("wb") as output:
        writer.write(output)
    return Path(path)


def used_page_fonts(page):
    """Resolve only font resources actually selected by Tf in this page's stream."""
    resources = page_fonts(page)
    used_names = {
        str(operands[0])
        for operands, operator in page.get_contents().operations
        if operator == b"Tf" and operands
    }
    return {name: resources[name] for name in used_names if name in resources}


class RealPdfFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.pdf_path = build_fixtures(Path(cls.temp_dir.name) / "native-text-fixtures.pdf")
        cls.reader = PdfReader(str(cls.pdf_path))\n        cls.identity_h_path = add_identity_h_cidfonttype2_fixture(\n            Path(cls.temp_dir.name) / "identity-h-cidfonttype2.pdf"\n        )\n        cls.identity_h_reader = PdfReader(str(cls.identity_h_path))

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_fixture_has_four_pages(self):
        self.assertEqual(len(self.reader.pages), 4)

    def test_winansi_type1_text_and_encoding_are_used(self):
        page = self.reader.pages[0]
        self.assertIn("WINANSI_FIXTURE: Invoice 12345", page.extract_text())
        fonts = used_page_fonts(page)
        self.assertTrue(
            any(font.get("/Subtype") == "/Type1" and font.get("/Encoding") == "/WinAnsiEncoding"
                for font in fonts.values()),
            "Expected the page content to select a Type1 WinAnsi font",
        )

    def test_embedded_truetype_and_tounicode_cover_russian_and_kazakh(self):
        page = self.reader.pages[1]
        extracted = page.extract_text()
        for marker in ("Привет, мир", "Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі", "Élève, façade"):
            self.assertIn(marker, extracted)

        fonts = used_page_fonts(page)
        embedded = []
        for font in fonts.values():
            descriptor = dereference(font.get("/FontDescriptor"))
            if descriptor and descriptor.get("/FontFile2") and font.get("/ToUnicode"):
                embedded.append((font, dereference(font["/ToUnicode"]).get_data()))
        self.assertTrue(embedded, "Expected the selected TrueType font to be embedded with ToUnicode")
        cmap_data = b"\n".join(data for _, data in embedded)
        for unicode_hex in (b"04D8", b"04D9", b"0492", b"0493", b"049A", b"049B", b"04A2", b"04A3", b"04E8", b"04E9", b"04B0", b"04B1", b"04AE", b"04AF", b"04BA", b"04BB", b"0406", b"0456"):
            self.assertIn(unicode_hex, cmap_data, f"ToUnicode should map Kazakh code point {unicode_hex.decode()}")

    def test_type0_cid_font_uses_unicode_encoding_and_widths(self):
        page = self.reader.pages[2]
        self.assertIn("日本語テスト", page.extract_text())
        fonts = used_page_fonts(page)
        cid_fonts = [font for font in fonts.values() if font.get("/Subtype") == "/Type0"]
        self.assertTrue(cid_fonts, "Expected page content to select a Type0/CID font")
        font = cid_fonts[0]
        self.assertEqual(str(font.get("/Encoding")), "/UniJIS-UCS2-H")
        descendants = [dereference(item) for item in font.get("/DescendantFonts", [])]
        self.assertTrue(descendants, "Type0 font must reference a descendant CID font")
        self.assertTrue(any(item.get("/Subtype") == "/CIDFontType0" for item in descendants))
        self.assertTrue(any(item.get("/W") for item in descendants), "Expected explicit CID width data")

    def test_identity_h_cidfonttype2_embeds_font_and_maps_cid_to_gid(self):
        page = self.identity_h_reader.pages[0]
        self.assertEqual(page.extract_text(), "A")
        font = used_page_fonts(page)["/F0"]
        self.assertEqual(str(font.get("/Encoding")), "/Identity-H")
        self.assertTrue(font.get("/ToUnicode"), "Expected a ToUnicode CMap")
        descendant = dereference(font["/DescendantFonts"][0])
        self.assertEqual(str(descendant.get("/Subtype")), "/CIDFontType2")
        mapping = dereference(descendant["/CIDToGIDMap"]).get_data()
        self.assertEqual(mapping[2:4], (36).to_bytes(2, "big"))
        descriptor = dereference(descendant["/FontDescriptor"])
        self.assertTrue(descriptor.get("/FontFile2"), "Expected embedded TrueType font data")
        self.assertTrue(descendant.get("/W"), "Expected explicit CID width data")

    def test_table_text_and_vector_rules_coexist(self):
        page = self.reader.pages[3]
        extracted = page.extract_text()
        self.assertIn("TABLE_HEADER: Item", extracted)
        self.assertIn("TABLE_CELL: 1250", extracted)
        operations = page.get_contents().operations
        operators = [operator for _, operator in operations]
        self.assertIn(b"re", operators, "Expected a vector rectangle for the table")
        self.assertIn(b"l", operators, "Expected vector table rules")

    def test_rotated_text_uses_a_rotated_coordinate_transform(self):
        page = self.reader.pages[3]
        self.assertIn("ROTATED_FIXTURE: Vertical placement", page.extract_text())
        operations = page.get_contents().operations
        matrices = [operands for operands, operator in operations if operator == b"cm"]
        self.assertTrue(
            any(
                len(matrix) == 6
                and abs(float(matrix[0])) < 0.001
                and abs(float(matrix[1]) - 1) < 0.001
                and abs(float(matrix[2]) + 1) < 0.001
                and abs(float(matrix[3])) < 0.001
                for matrix in matrices
            ),
            "Expected a 90-degree text coordinate transform",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
