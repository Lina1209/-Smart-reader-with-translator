import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import DictionaryObject, NameObject, NumberObject, ArrayObject

from pdf_font_resource_audit import audit_font_dictionary
from generate_pdf_fixtures import build_fixtures
from test_pdf_real_fixtures import add_identity_h_cidfonttype2_fixture, used_page_fonts


class PdfFontResourceAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        cls.reader = PdfReader(str(build_fixtures(Path(cls.temp_dir.name) / "font-fixtures.pdf")))
        cls.identity_path = add_identity_h_cidfonttype2_fixture(
            Path(cls.temp_dir.name) / "identity-font.pdf"
        )
        cls.identity_reader = PdfReader(str(cls.identity_path))

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_simple_type1_reports_encoding_and_width_limits(self):
        font = next(iter(used_page_fonts(self.reader.pages[0]).values()))
        report = audit_font_dictionary(font)
        self.assertEqual(report["subtype"], "/Type1")
        self.assertEqual(report["encoding"]["name"], "/WinAnsiEncoding")
        self.assertFalse(report["font_program_embedded"])
        self.assertFalse(report["rewrite_ready"])

    def test_embedded_subset_truetype_does_not_claim_target_glyph_coverage(self):
        font = next(iter(used_page_fonts(self.reader.pages[1]).values()))
        report = audit_font_dictionary(font)
        self.assertTrue(report["font_program_embedded"])
        self.assertTrue(report["to_unicode"]["present"])
        self.assertIn("/FontFile2", report["font_program_keys"])
        self.assertFalse(report["rewrite_ready"])
        self.assertTrue(any("subset" in item for item in report["limitations"]))

    def test_predefined_type0_cmap_reports_cid_descendant(self):
        font = next(iter(used_page_fonts(self.reader.pages[2]).values()))
        report = audit_font_dictionary(font)
        self.assertEqual(report["subtype"], "/Type0")
        self.assertEqual(report["encoding"]["name"], "/UniJIS-UCS2-H")
        self.assertEqual(report["descendants"][0]["subtype"], "/CIDFontType0")
        self.assertTrue(report["descendants"][0]["widths"]["explicit_widths_present"])

    def test_identity_h_type0_reports_cid_to_gid_stream_and_embedded_font(self):
        font = used_page_fonts(self.identity_reader.pages[0])["/F0"]
        report = audit_font_dictionary(font)
        descendant = report["descendants"][0]
        self.assertEqual(report["encoding"]["name"], "/Identity-H")
        self.assertTrue(report["font_program_embedded"])
        self.assertEqual(descendant["cid_to_gid"]["kind"], "stream")
        self.assertEqual(descendant["cid_to_gid"]["two_byte_entry_count"], 2)
        self.assertTrue(descendant["widths"]["explicit_widths_present"])
        self.assertTrue(report["to_unicode"]["present"])
        self.assertFalse(report["rewrite_ready"])

    def test_missing_maps_and_font_program_fail_closed(self):
        font = DictionaryObject({
            NameObject("/Subtype"): NameObject("/TrueType"),
            NameObject("/BaseFont"): NameObject("/ExampleSubset"),
            NameObject("/FirstChar"): NumberObject(32),
            NameObject("/Widths"): ArrayObject([NumberObject(500)]),
        })
        report = audit_font_dictionary(font)
        self.assertFalse(report["to_unicode"]["present"])
        self.assertFalse(report["font_program_embedded"])
        self.assertEqual(report["simple_widths"]["width_count"], 1)
        self.assertFalse(report["rewrite_ready"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
