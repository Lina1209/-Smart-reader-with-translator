import tempfile
import unittest
from pathlib import Path

from fontTools.ttLib import TTFont

from pdf_truetype_glyph_audit import inspect_truetype_glyph
from test_pdf_real_fixtures import add_identity_h_cidfonttype2_fixture


class TrueTypeGlyphAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from generate_pdf_fixtures import _dejavu_path
        cls.font_program = Path(_dejavu_path()).read_bytes()
        cls.font = TTFont(_dejavu_path(), lazy=False)
        cls.cmap = cls.font.getBestCmap()
        cls.glyph_order = cls.font.getGlyphOrder()
        cls.name_to_gid = {name: index for index, name in enumerate(cls.glyph_order)}

    @classmethod
    def tearDownClass(cls):
        cls.font.close()

    def test_simple_letter_has_real_outline_and_unicode_cmap(self):
        glyph_name = self.cmap[0x41]
        gid = self.name_to_gid[glyph_name]
        report = inspect_truetype_glyph(self.font_program, gid)
        self.assertEqual(report["status"], "outline-present")
        self.assertEqual(report["glyph_name"], glyph_name)
        self.assertIn(0x41, report["unicode_codepoints"])
        self.assertGreater(report["number_of_contours"], 0)
        self.assertEqual(report["horizontal_metrics"]["status"], "available")
        self.assertGreater(report["horizontal_metrics"]["advance_width"], 0)
        self.assertEqual(report["outline_bounds"]["status"], "available")
        self.assertGreater(report["outline_bounds"]["width"], 0)

    def test_composite_glyph_resolves_component_outline(self):
        glyph_name = self.cmap[0x00E9]
        gid = self.name_to_gid[glyph_name]
        report = inspect_truetype_glyph(self.font_program, gid)
        self.assertEqual(report["status"], "composite-outline-present")
        self.assertGreater(report["composite_component_count"], 0)
        self.assertEqual(report["horizontal_metrics"]["status"], "available")
        self.assertEqual(report["outline_bounds"]["status"], "available")

    def test_space_glyph_is_reported_as_empty_not_missing(self):
        glyph_name = self.cmap[0x20]
        gid = self.name_to_gid[glyph_name]
        report = inspect_truetype_glyph(self.font_program, gid)
        self.assertEqual(report["status"], "empty-glyph")
        self.assertEqual(report["horizontal_metrics"]["status"], "available")
        self.assertGreater(report["horizontal_metrics"]["advance_width"], 0)
        self.assertEqual(report["outline_bounds"]["status"], "available")
        self.assertEqual(report["outline_bounds"]["width"], 0)

    def test_invalid_font_program_and_gid_fail_closed(self):
        self.assertEqual(inspect_truetype_glyph(b"not a font", 1)["status"], "unreadable-font")
        self.assertEqual(inspect_truetype_glyph(self.font_program, -1)["status"], "invalid-gid")
        self.assertEqual(
            inspect_truetype_glyph(self.font_program, len(self.glyph_order) + 5)["status"],
            "gid-out-of-range",
        )

    def test_real_pdf_embedded_font_program_resolves_mapped_gid(self):
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = add_identity_h_cidfonttype2_fixture(Path(directory) / "cid-font.pdf")
            from pypdf import PdfReader
            reader = PdfReader(str(pdf_path))
            type0 = reader.pages[0]["/Resources"]["/Font"]["/F0"].get_object()
            descendant = type0["/DescendantFonts"][0].get_object()
            descriptor = descendant["/FontDescriptor"].get_object()
            program = descriptor["/FontFile2"].get_object().get_data()
            report = inspect_truetype_glyph(program, 36)
            self.assertEqual(report["status"], "outline-present")
            self.assertIn(0x41, report["unicode_codepoints"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
