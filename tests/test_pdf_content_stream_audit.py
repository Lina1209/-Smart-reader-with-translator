import unittest

from pypdf.generic import DecodedStreamObject, NameObject
from pypdf import PdfWriter

from pdf_content_stream_audit import audit_content_operations


def operations_for(data):
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    stream = DecodedStreamObject()
    stream.set_data(data)
    page[NameObject("/Contents")] = writer._add_object(stream)
    return page.get_contents().operations


class PdfContentStreamAuditTests(unittest.TestCase):
    def test_reports_full_text_state_for_tj_run(self):
        ops = operations_for(
            b"BT /F1 18 Tf 0.8 Tc 2 Tw 95 Tz 14 TL 3 Ts 1 Tr "
            b"1 0 0 1 60 700 Tm [(A) -120 (V)] TJ ET"
        )
        report = audit_content_operations(ops)
        self.assertEqual(len(report["events"]), 1)
        event = report["events"][0]
        self.assertEqual(event["operator"], "TJ")
        self.assertEqual(event["text_state"], {
            "font": "/F1", "font_size": 18.0, "char_spacing": 0.8,
            "word_spacing": 2.0, "horizontal_scale": 95.0,
            "leading": 14.0, "rise": 3.0, "render_mode": 1,
        })
        self.assertIn("-120", event["operands"][0])
        self.assertEqual(event["text_matrix_after_show"], "not-computed")
        self.assertFalse(event["implicit_line_move"])

    def test_tracks_multiple_show_ops_and_state_changes(self):
        ops = operations_for(
            b"BT /F1 10 Tf (first) Tj 1 Tc (second) Tj "
            b"[(third) 40 (fourth)] TJ ET"
        )
        report = audit_content_operations(ops)
        self.assertEqual([e["operator"] for e in report["events"]], ["Tj", "Tj", "TJ"])
        self.assertEqual(report["events"][0]["text_state"]["char_spacing"], 0.0)
        self.assertEqual(report["events"][1]["text_state"]["char_spacing"], 1.0)

    def test_quote_operators_apply_implicit_line_move_and_spacing(self):
        single_ops = operations_for(b"BT /F1 11 Tf 5 TL (line-two) ' ET")
        single_event = audit_content_operations(single_ops)["events"][0]
        self.assertEqual(single_event["operator"], "'")
        self.assertTrue(single_event["implicit_line_move"])

        double_ops = operations_for(b'BT /F1 11 Tf 5 TL 2 0.5 (line-three) " ET')
        double_event = audit_content_operations(double_ops)["events"][0]
        self.assertEqual(double_event["operator"], '"')
        self.assertTrue(double_event["implicit_line_move"])
        self.assertEqual(double_event["text_state"]["word_spacing"], 2.0)
        self.assertEqual(double_event["text_state"]["char_spacing"], 0.5)

    def test_reports_graphics_stack_clip_and_form_calls_without_claiming_resolution(self):
        ops = operations_for(b"q 0 0 100 100 re W n /Fm1 Do Q")
        report = audit_content_operations(ops)
        self.assertEqual(report["clip_operator_count"], 1)
        self.assertEqual(report["form_invocations"], 1)
        self.assertEqual(report["unmatched_graphics_saves"], 0)
        self.assertFalse(report["pending_clip_at_end"])
        self.assertTrue(any("not resolved" in item for item in report["limitations"]))

    def test_detects_unbalanced_state(self):
        ops = operations_for(b"q BT /F1 12 Tf (x) Tj")
        report = audit_content_operations(ops)
        self.assertTrue(report["unclosed_text_object"])
        self.assertEqual(report["unmatched_graphics_saves"], 1)

    def test_reports_unmatched_restore(self):
        ops = operations_for(b"Q")
        report = audit_content_operations(ops)
        self.assertEqual(report["unknown"], [{"index": 0, "reason": "unmatched-Q"}])


if __name__ == "__main__":
    unittest.main(verbosity=2)
