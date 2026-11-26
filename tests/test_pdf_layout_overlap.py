import unittest

from pdf_layout_overlap import intersection_area, overlap_report


class PdfLayoutOverlapTests(unittest.TestCase):
    def test_disjoint_and_edge_touching_boxes_are_not_overlaps(self):
        self.assertEqual(intersection_area((0, 0, 10, 10), (10, 0, 20, 10)), 0.0)
        self.assertEqual(intersection_area((0, 0, 10, 10), (12, 0, 20, 10)), 0.0)
        report = overlap_report((0, 0, 10, 10), [(10, 0, 20, 10)])
        self.assertEqual(report["status"], "clear")

    def test_partial_overlap_area_is_exact(self):
        report = overlap_report((0, 0, 10, 10), [(8, 4, 14, 12)])
        self.assertEqual(report["status"], "overlap")
        self.assertEqual(report["overlaps"][0]["intersection_area"], 12.0)

    def test_contained_obstacle_and_multiple_overlaps(self):
        report = overlap_report((0, 0, 20, 20), [(2, 2, 4, 4), (15, 15, 25, 25)])
        self.assertEqual(report["status"], "overlap")
        self.assertEqual(len(report["overlaps"]), 2)

    def test_invalid_obstacles_are_reported_as_unknown(self):
        report = overlap_report((0, 0, 10, 10), [(1, 1, 2, 2), (4, 4, 4, 8), None])
        self.assertEqual(report["status"], "overlap")
        self.assertEqual(report["unknown_obstacles"], [1, 2])

    def test_only_unknown_obstacles_yield_incomplete_not_clear(self):
        report = overlap_report((0, 0, 10, 10), [None])
        self.assertEqual(report["status"], "incomplete")

    def test_invalid_text_box_or_threshold_fails_closed(self):
        self.assertEqual(overlap_report((0, 0, 0, 5), [] )["status"], "invalid-input")
        self.assertEqual(overlap_report((0, 0, 5, 5), [], -1)["status"], "invalid-input")
        self.assertIsNone(intersection_area((0, 0, float("nan"), 5), (0, 0, 1, 1)))


if __name__ == "__main__":
    unittest.main(verbosity=2)
