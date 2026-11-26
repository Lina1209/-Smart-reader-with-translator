#!/usr/bin/env python3
"""Inspect generated PDFs with an independent parser; no PDF rewriting occurs."""
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader

from generate_pdf_fixtures import build_fixtures


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def page_fonts(page):
    resources = dereference(page["/Resources"])
    fonts = dereference(resources["/Font"])
    return {name: dereference(font) for name, font in fonts.items()}


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
