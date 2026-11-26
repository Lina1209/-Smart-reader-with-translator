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
    return [dereference(font) for font in fonts.values()]


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

    def test_winansi_type1_text_is_extractable(self):
        page = self.reader.pages[0]
        self.assertIn("WINANSI_FIXTURE: Invoice 12345", page.extract_text())
        fonts = page_fonts(page)
        self.assertTrue(any(font.get("/Subtype") == "/Type1" for font in fonts))

    def test_embedded_truetype_contains_russian_and_kazakh(self):
        page = self.reader.pages[1]
        extracted = page.extract_text()
        for marker in ("Привет, мир", "Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі", "Élève, façade"):
            self.assertIn(marker, extracted)
        fonts = page_fonts(page)
        embedded = []
        for font in fonts:
            descriptor = dereference(font.get("/FontDescriptor"))
            if descriptor and descriptor.get("/FontFile2"):
                embedded.append(font)
        self.assertTrue(embedded, "Expected an embedded TrueType font program")

    def test_type0_cid_font_and_unicode_cmap_are_present(self):
        page = self.reader.pages[2]
        self.assertIn("日本語テスト", page.extract_text())
        fonts = page_fonts(page)
        cid_fonts = [font for font in fonts if font.get("/Subtype") == "/Type0"]
        self.assertTrue(cid_fonts, "Expected a Type0/CID font")
        self.assertTrue(any(str(font.get("/Encoding", "")).startswith("/Uni") for font in cid_fonts))

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
