#!/usr/bin/env python3
"""Inspect generated PDFs with an independent parser; no PDF rewriting occurs."""
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject,
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
    cid_to_gid_ref = add_stream(b"\x00\x00" + (36).to_bytes(2, "big"))
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


def add_tj_spacing_fixture(path):
    """Build a PDF page with a TJ array and non-default text-state operators."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
        NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
    })
    font_ref = writer._add_object(font)
    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref}),
    })
    content = DecodedStreamObject()
    content.set_data(
        b"BT /F1 18 Tf 0.8 Tc 2 Tw 95 Tz 3 Ts "
        b"1 0 0 1 60 700 Tm [(A) -120 (V)] TJ ET"
    )
    page[NameObject("/Contents")] = writer._add_object(content)
    with Path(path).open("wb") as output:
        writer.write(output)
    return Path(path)


def add_nested_form_and_clipping_fixture(path):
    """Build nested Form XObjects with inherited transforms and clipping paths."""
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)

    font = DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
        NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
    })
    font_ref = writer._add_object(font)

    def form_xobject(data, bbox, resources, matrix=None):
        stream = DecodedStreamObject()
        stream.set_data(data)
        stream.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/FormType"): NumberObject(1),
            NameObject("/BBox"): ArrayObject([NumberObject(v) for v in bbox]),
            NameObject("/Resources"): resources,
        })
        if matrix is not None:
            stream[NameObject("/Matrix")] = ArrayObject([FloatObject(v) for v in matrix])
        return writer._add_object(stream)

    inner_resources = DictionaryObject({
        NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref}),
    })
    inner = form_xobject(
        b"BT /F1 13 Tf 1 0 0 1 12 35 Tm (NESTED_FORM_TEXT) Tj ET",
        [0, 0, 180, 80],
        inner_resources,
        [1, 0, 0, 1, 4, 6],
    )

    outer_resources = DictionaryObject({
        NameObject("/XObject"): DictionaryObject({NameObject("/Inner"): inner}),
    })
    outer = form_xobject(
        b"0 0 170 70 re W n q 0.8 0 0 0.8 9 11 cm /Inner Do Q",
        [0, 0, 180, 80],
        outer_resources,
        [1, 0.15, -0.1, 1, 20, 25],
    )

    page[NameObject("/Resources")] = DictionaryObject({
        NameObject("/XObject"): DictionaryObject({NameObject("/Outer"): outer}),
    })
    content = DecodedStreamObject()
    content.set_data(
        b"q 0 0 260 150 re W n 0.9 0 0 0.9 70 320 cm /Outer Do Q"
    )
    page[NameObject("/Contents")] = writer._add_object(content)

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
        cls.reader = PdfReader(str(cls.pdf_path))
        cls.identity_h_path = add_identity_h_cidfonttype2_fixture(
            Path(cls.temp_dir.name) / "identity-h-cidfonttype2.pdf"
        )
        cls.identity_h_reader = PdfReader(str(cls.identity_h_path))
        cls.tj_path = add_tj_spacing_fixture(Path(cls.temp_dir.name) / "tj-spacing.pdf")
        cls.tj_reader = PdfReader(str(cls.tj_path))
        cls.nested_path = add_nested_form_and_clipping_fixture(
            Path(cls.temp_dir.name) / "nested-forms-clipping.pdf"
        )
        cls.nested_reader = PdfReader(str(cls.nested_path))

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

    def test_tj_array_and_text_spacing_operators_are_preserved_as_distinct_tokens(self):
        page = self.tj_reader.pages[0]
        self.assertEqual(page.extract_text(), "AV")
        operations = page.get_contents().operations
        by_operator = {operator: operands for operands, operator in operations}
        self.assertIn(b"TJ", by_operator)
        self.assertEqual(by_operator[b"TJ"][0], ["A", -120, "V"])
        for operator in (b"Tc", b"Tw", b"Tz", b"Ts", b"Tm"):
            self.assertIn(operator, by_operator, f"Expected text-state operator {operator.decode()}")

    def test_nested_form_xobjects_and_clipping_paths_are_present(self):
        page = self.nested_reader.pages[0]
        page_ops = page.get_contents().operations
        page_operators = [operator for _, operator in page_ops]
        self.assertIn(b"W", page_operators, "Page-level clipping path must be present")
        self.assertIn(b"Do", page_operators, "Page must invoke the outer Form XObject")

        page_resources = dereference(page["/Resources"])
        page_xobjects = dereference(page_resources["/XObject"])
        outer = dereference(page_xobjects["/Outer"])
        self.assertEqual(str(outer.get("/Subtype")), "/Form")
        self.assertEqual(len(outer.get("/Matrix")), 6)
        outer_ops = outer.get_data()
        self.assertIn(b"/Inner Do", outer_ops)
        self.assertIn(b"W n", outer_ops)

        outer_resources = dereference(outer["/Resources"])
        inner_xobjects = dereference(outer_resources["/XObject"])
        inner = dereference(inner_xobjects["/Inner"])
        self.assertEqual(str(inner.get("/Subtype")), "/Form")
        self.assertEqual(len(inner.get("/Matrix")), 6)
        inner_ops = inner.get_data()
        self.assertIn(b"NESTED_FORM_TEXT", inner_ops)
        inner_resources = dereference(inner["/Resources"])
        self.assertIn("/F1", {str(key) for key in dereference(inner_resources["/Font"]).keys()})

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
