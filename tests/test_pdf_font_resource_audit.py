import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import DictionaryObject, NameObject, NumberObject, ArrayObject

from pdf_font_resource_audit import (
    audit_font_dictionary, lookup_cid_width, lookup_cid_to_gid, lookup_simple_width,
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
        mapping_stream = descendant["/CIDToGIDMap"].get_object()
        self.assertEqual(lookup_cid_to_gid(mapping_stream, 1), {
            "status": "explicit", "gid": 36, "source": "CIDToGIDMap stream"
        })

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



    def test_cid_to_gid_identity_default_and_explicit_mapping(self):
        self.assertEqual(
            lookup_cid_to_gid(None, 12),
            {"status": "identity-default", "gid": 12, "source": "PDF default"},
        )
        self.assertEqual(
            lookup_cid_to_gid("/Identity", 12),
            {"status": "identity", "gid": 12, "source": "/Identity"},
        )
        mapping = bytes([0, 0, 0, 36, 0, 91])
        self.assertEqual(
            lookup_cid_to_gid(mapping, 1),
            {"status": "explicit", "gid": 36, "source": "CIDToGIDMap stream"},
        )
        self.assertEqual(lookup_cid_to_gid(mapping, 2)["gid"], 91)

    def test_cid_to_gid_rejects_odd_stream_and_out_of_range_cid(self):
        self.assertEqual(lookup_cid_to_gid(b"\x00\x01\x00", 0)["status"], "malformed-odd-length")
        self.assertEqual(lookup_cid_to_gid(b"\x00\x01", 1)["status"], "cid-out-of-range")

    def test_cid_to_gid_rejects_invalid_cid_and_non_type2_descendant(self):
        self.assertEqual(lookup_cid_to_gid(b"\x00\x01", -1)["status"], "invalid-cid")
        self.assertEqual(lookup_cid_to_gid(b"\x00\x01", 65536)["status"], "invalid-cid")
        self.assertEqual(
            lookup_cid_to_gid(b"\x00\x01", 0, "/CIDFontType0")["status"],
            "not-applicable",
        )

if __name__ == "__main__":
    unittest.main(verbosity=2)


from pdf_tounicode_cmap import parse_tounicode_cmap


class PdfToUnicodeCMapTests(unittest.TestCase):
    def test_bfchar_decodes_basic_and_surrogate_pair_destinations(self):
        cmap = b"""
        2 beginbfchar
        <01> <0041>
        <02> <D83DDE00>
        endbfchar
        """
        report = parse_tounicode_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"01": "A", "02": "\U0001F600"})

    def test_bfrange_scalar_destination_increments_unicode_code_units(self):
        cmap = b"1 beginbfrange <10> <12> <0061> endbfrange"
        report = parse_tounicode_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"10": "a", "11": "b", "12": "c"})

    def test_bfrange_array_destination_maps_each_entry(self):
        cmap = b"1 beginbfrange <20> <22> [<0041> <03A9> <4E2D>] endbfrange"
        report = parse_tounicode_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"20": "A", "21": chr(0x03A9), "22": chr(0x4E2D)})

    def test_comments_whitespace_and_odd_hex_nibble_are_handled(self):
        cmap = b"1 beginbfchar % mapping follows\n <A> <0042> endbfchar"
        report = parse_tounicode_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"A0": "B"})

    def test_malformed_utf16_and_duplicate_source_fail_closed(self):
        malformed = parse_tounicode_cmap(b"1 beginbfchar <01> <D800> endbfchar")
        duplicate = parse_tounicode_cmap(
            b"2 beginbfchar <01> <0041> <01> <0042> endbfchar"
        )
        self.assertEqual(malformed["status"], "malformed")
        self.assertEqual(duplicate["status"], "malformed")

    def test_unsupported_and_oversized_ranges_are_not_expanded(self):
        unsupported = parse_tounicode_cmap(b"1 beginnotdefchar <01> <0000> endnotdefchar")
        oversized = parse_tounicode_cmap(
            b"1 beginbfrange <00> <10> <0041> endbfrange", max_range=4
        )
        self.assertEqual(unsupported["status"], "malformed")
        self.assertEqual(oversized["status"], "malformed")
        self.assertEqual(oversized["mapping_count"], 0)

    def test_invalid_input_and_non_hex_tokens_are_reported(self):
        self.assertEqual(parse_tounicode_cmap("not bytes")["status"], "invalid-input")
        malformed = parse_tounicode_cmap(b"1 beginbfchar /Name <0041> endbfchar")
        self.assertEqual(malformed["status"], "malformed")
