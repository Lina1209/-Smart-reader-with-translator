import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import DictionaryObject, NameObject, NumberObject, ArrayObject

from pdf_font_resource_audit import (
    audit_font_dictionary, lookup_cid_width, lookup_simple_width,
)
from generate_pdf_fixtures import build_fixtures
from test_pdf_real_fixtures import add_identity_h_cidfonttype2_fixture, used_page_fonts


def selected_font(page, subtype):
    return next(
        font for font in used_page_fonts(page).values()
        if str(font.get("/Subtype")) == subtype
    )


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
        font = selected_font(self.reader.pages[0], "/Type1")
        report = audit_font_dictionary(font)
        self.assertEqual(report["subtype"], "/Type1")
        self.assertEqual(report["encoding"]["name"], "/WinAnsiEncoding")
        self.assertFalse(report["font_program_embedded"])
        self.assertFalse(report["rewrite_ready"])

    def test_embedded_subset_truetype_does_not_claim_target_glyph_coverage(self):
        font = selected_font(self.reader.pages[1], "/TrueType")
        report = audit_font_dictionary(font)
        self.assertTrue(report["font_program_embedded"])
        self.assertTrue(report["to_unicode"]["present"])
        self.assertIn("/FontFile2", report["font_program_keys"])
        self.assertFalse(report["rewrite_ready"])
        self.assertTrue(any("subset" in item for item in report["limitations"]))
        self.assertEqual(lookup_simple_width(font, 32)["status"], "explicit")
        self.assertGreater(lookup_simple_width(font, 32)["width"], 0)
        self.assertEqual(lookup_simple_width(font, 999)["status"], "invalid-code")

    def test_predefined_type0_cmap_reports_cid_descendant(self):
        font = selected_font(self.reader.pages[2], "/Type0")
        report = audit_font_dictionary(font)
        self.assertEqual(report["subtype"], "/Type0")
        self.assertEqual(report["encoding"]["name"], "/UniJIS-UCS2-H")
        self.assertEqual(report["descendants"][0]["subtype"], "/CIDFontType0")
        self.assertEqual(report["descendants"][0]["cid_to_gid"]["kind"], "not-applicable")
        self.assertTrue(report["descendants"][0]["widths"]["explicit_widths_present"])

    def test_identity_h_type0_reports_cid_to_gid_stream_and_embedded_font(self):
        font = used_page_fonts(self.identity_reader.pages[0])["/F0"]
        report = audit_font_dictionary(font)
        descendant = font["/DescendantFonts"][0].get_object()
        self.assertEqual(report["encoding"]["name"], "/Identity-H")
        self.assertTrue(report["font_program_embedded"])
        self.assertEqual(report["descendants"][0]["cid_to_gid"]["kind"], "stream")
        self.assertEqual(report["descendants"][0]["cid_to_gid"]["two_byte_entry_count"], 2)
        self.assertTrue(report["descendants"][0]["widths"]["explicit_widths_present"])
        self.assertTrue(report["to_unicode"]["present"])
        self.assertFalse(report["rewrite_ready"])
        self.assertEqual(lookup_cid_width(descendant, 1), {
            "status": "explicit", "width": 667.0, "source": "/W"
        })
        self.assertEqual(lookup_cid_width(descendant, 2), {
            "status": "default", "width": 600.0, "source": "/DW"
        })
        self.assertEqual(lookup_cid_width(descendant, -1)["status"], "invalid-cid")

    def test_cid_width_array_and_range_forms_are_both_resolved(self):
        descendant = DictionaryObject({
            NameObject("/W"): ArrayObject([
                NumberObject(2), ArrayObject([NumberObject(510), NumberObject(520)]),
                NumberObject(8), NumberObject(10), NumberObject(610),
            ]),
            NameObject("/DW"): NumberObject(1000),
        })
        self.assertEqual(lookup_cid_width(descendant, 2)["width"], 510.0)
        self.assertEqual(lookup_cid_width(descendant, 3)["width"], 520.0)
        self.assertEqual(lookup_cid_width(descendant, 9)["width"], 610.0)
        self.assertEqual(lookup_cid_width(descendant, 10)["width"], 610.0)
        self.assertEqual(lookup_cid_width(descendant, 11)["status"], "default")

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
        self.assertEqual(lookup_simple_width(font, 32), {
            "status": "explicit", "width": 500.0, "source": "/Widths"
        })
        self.assertEqual(lookup_simple_width(font, 33)["status"], "unknown")
        self.assertFalse(report["rewrite_ready"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
