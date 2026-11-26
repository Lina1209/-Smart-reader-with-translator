import unittest

from pdf_character_mapping_audit import resolve_type0_character_code


class PdfCharacterMappingAuditTests(unittest.TestCase):
    def setUp(self):
        self.encoding = {
            "status": "parsed",
            "mappings": {"01": 7, "02": 8},
        }
        self.unicode = {
            "status": "parsed",
            "mappings": {"01": "A", "02": "\u0416"},
        }

    def test_joins_source_code_unicode_cid_and_explicit_gid(self):
        report = resolve_type0_character_code(
            "01", self.encoding, self.unicode, bytes([0, 0, 0, 36, 0, 91])
        )
        self.assertEqual(report["status"], "mapped")
        self.assertEqual(report["unicode"], "A")
        self.assertEqual(report["cid"], 7)
        self.assertEqual(report["gid"], 36)

    def test_joins_using_identity_default_when_map_is_absent(self):
        report = resolve_type0_character_code("02", self.encoding, self.unicode)
        self.assertEqual(report["status"], "mapped")
        self.assertEqual(report["unicode"], "\u0416")
        self.assertEqual(report["cid"], 8)
        self.assertEqual(report["gid"], 8)

    def test_missing_cid_and_unicode_are_distinguished(self):
        missing_cid = resolve_type0_character_code("03", self.encoding, self.unicode)
        missing_unicode = resolve_type0_character_code(
            "01", self.encoding, {"status": "parsed", "mappings": {}}
        )
        self.assertEqual(missing_cid["status"], "missing-cid-mapping")
        self.assertEqual(missing_unicode["status"], "missing-unicode-mapping")

    def test_invalid_gid_mapping_is_not_reported_as_mapped(self):
        report = resolve_type0_character_code(
            "01", self.encoding, self.unicode, b"\x00\x01"
        )
        self.assertEqual(report["status"], "cid-to-gid-cid-out-of-range")
        self.assertIsNone(report["gid"])

    def test_cidfonttype0_does_not_apply_type2_cid_to_gid_rules(self):
        report = resolve_type0_character_code(
            "01", self.encoding, self.unicode, None, "/CIDFontType0"
        )
        self.assertEqual(report["status"], "cid-to-gid-not-applicable")
        self.assertIsNone(report["gid"])

    def test_source_code_hex_is_validated(self):
        for invalid in ("", "1", "GG", "123456789", 1, None):
            self.assertEqual(
                resolve_type0_character_code(invalid, self.encoding, self.unicode)["status"],
                "invalid-source-code",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
