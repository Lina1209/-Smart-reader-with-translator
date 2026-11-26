import unittest

from pdf_text_image_overlap import compare_text_fragments_to_images, text_geometry_polygon


def fragment(text, x=0, y=0, width=10, height=10):
    return {
        "text": text,
        "baseline": {"x": x, "y": y},
        "basis": {"x": {"x": 1, "y": 0}, "y": {"x": 0, "y": 1}},
        "advance": width,
        "height": height,
    }


def image(points, unresolved=False):
    return {"transformed_corners": points, "form_clip_intersection_corners": points,
            "bbox": (min(p[0] for p in points), min(p[1] for p in points),
                     max(p[0] for p in points), max(p[1] for p in points)),
            "arbitrary_clip_unresolved": unresolved}


class TextImageOverlapTests(unittest.TestCase):
    def test_geometry_polygon_preserves_rotated_basis(self):
        f = fragment("rot", 20, 20)
        f["basis"] = {"x": {"x": 0, "y": 1}, "y": {"x": -1, "y": 0}}
        poly = text_geometry_polygon(f)
        self.assertEqual(poly, [(20, 20), (20.0, 30.0), (10.0, 30.0), (10.0, 20.0)])

    def test_reports_overlap_with_image(self):
        report = compare_text_fragments_to_images([fragment("text")], {
            "placements": [image([(5, 0), (15, 0), (15, 10), (5, 10)])],
            "unknown": [],
        })
        self.assertEqual(report["status"], "overlap")
        self.assertEqual(len(report["overlaps"]), 1)
        self.assertEqual(report["overlaps"][0]["overlap_area"], 50.0)

    def test_nonoverlap_clear(self):
        report = compare_text_fragments_to_images([fragment("text")], {
            "placements": [image([(20, 20), (30, 20), (30, 30), (20, 30)])],
            "unknown": [],
        })
        self.assertEqual(report["status"], "clear")
        self.assertEqual(report["overlaps"], [])

    def test_clipped_image_polygon_is_used(self):
        placement = image([(0, 0), (20, 0), (20, 10), (0, 10)])
        placement["form_clip_intersection_corners"] = [(10, 0), (20, 0), (20, 10), (10, 10)]
        report = compare_text_fragments_to_images([fragment("text")], {"placements": [placement], "unknown": []})
        self.assertEqual(report["overlaps"][0]["overlap_area"], 0.0)
        self.assertEqual(report["status"], "clear")

    def test_unknown_clipping_is_not_claimed_clear(self):
        report = compare_text_fragments_to_images([fragment("text")], {
            "placements": [image([(2, 2), (8, 2), (8, 8), (2, 8)], unresolved=True)],
            "unknown": [],
        })
        self.assertEqual(report["status"], "overlap")
        self.assertTrue(any(x["reason"] == "image-arbitrary-clipping-unresolved" for x in report["unknown"]))

    def test_invalid_geometry_fails_incomplete(self):
        report = compare_text_fragments_to_images([{"text": "bad"}], {"placements": [], "unknown": []})
        self.assertEqual(report["status"], "incomplete")
        self.assertTrue(any(x["reason"] == "invalid-text-geometry" for x in report["unknown"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
