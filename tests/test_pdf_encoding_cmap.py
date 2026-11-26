import unittest

from pdf_encoding_cmap import parse_encoding_cmap


class PdfEncodingCMapTests(unittest.TestCase):
    def test_codespace_ranges_support_one_and_two_byte_codes(self):
        cmap = b"""
        2 begincodespacerange
        <00> <FF>
        <0000> <FFFF>
        endcodespacerange
        """
        report = parse_encoding_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(
            [(x["byte_length"], x["start"], x["end"]) for x in report["codespaces"]],
            [(1, 0, 255), (2, 0, 65535)],
        )

    def test_cidchar_maps_source_codes_to_cids(self):
        cmap = b"1 begincidchar <01> 7 <02> 42 endcidchar"
        report = parse_encoding_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"01": 7, "02": 42})

    def test_cidrange_expands_consecutive_cids(self):
        cmap = b"1 begincidrange <0010> <0012> 100 endcidrange"
        report = parse_encoding_cmap(cmap)
        self.assertEqual(report["status"], "parsed")
        self.assertEqual(report["mappings"], {"0010": 100, "0011": 101, "0012": 102})

    def test_codespace_mismatch_is_reported(self):
        cmap = b"1 begincodespacerange <00> <7F> endcodespacerange 1 begincidchar <80> 4 endcidchar"
        report = parse_encoding_cmap(cmap)
        self.assertEqual(report["status"], "malformed")
        self.assertTrue(any("outside declared codespaces" in x for x in report["errors"]))

    def test_duplicate_codes_and_invalid_ranges_fail_closed(self):
        duplicate = parse_encoding_cmap(b"2 begincidchar <01> 1 <01> 2 endcidchar")
        invalid = parse_encoding_cmap(b"1 begincidrange <02> <01> 3 endcidrange")
        self.assertEqual(duplicate["status"], "malformed")
        self.assertEqual(invalid["status"], "malformed")

    def test_expansion_limit_prevents_large_ranges(self):
        report = parse_encoding_cmap(
            b"1 begincidrange <0000> <1000> 0 endcidrange", max_range=10
        )
        self.assertEqual(report["status"], "malformed")
        self.assertEqual(report["mapping_count"], 0)

    def test_invalid_input_and_unsupported_predefined_style_are_not_guessed(self):
        self.assertEqual(parse_encoding_cmap("not bytes")["status"], "invalid-input")
        report = parse_encoding_cmap(b"/Identity-H")
        self.assertEqual(report["status"], "malformed")
        self.assertEqual(report["mappings"], {})


if __name__ == "__main__":
    unittest.main()
