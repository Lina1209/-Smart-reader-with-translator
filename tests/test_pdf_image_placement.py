import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import ArrayObject, DecodedStreamObject, DictionaryObject, FloatObject, NameObject, NumberObject

from pdf_image_placement import inspect_page_image_placements, multiply_matrices
from test_pdf_real_fixtures import add_transparency_image_overlay_fixture


class PdfImagePlacementTests(unittest.TestCase):
    def test_composes_affine_matrices(self):
        result = multiply_matrices((2, 0, 0, 3, 10, 20), (1, 0, 0, 1, 5, 7))
        self.assertEqual(result, (2, 0, 0, 3, 20, 41))

    def test_extracts_real_page_level_image_bbox_and_soft_mask(self):
        with tempfile.TemporaryDirectory() as temp:
            path = add_transparency_image_overlay_fixture(Path(temp) / "image.pdf")
            page = PdfReader(str(path)).pages[0]
            report = inspect_page_image_placements(page)
            self.assertEqual(report["status"], "incomplete")
            self.assertEqual(len(report["placements"]), 1)
            self.assertTrue(report["placements"][0]["arbitrary_clip_unresolved"])
            self.assertTrue(any(item["reason"] == "arbitrary-clipping-path-not-evaluated" for item in report["unknown"]))
            image = report["placements"][0]
            self.assertEqual(image["bbox"], (100.0, 400.0, 190.0, 450.0))
            self.assertEqual(image["width_pixels"], 2)
            self.assertEqual(image["height_pixels"], 2)
            self.assertTrue(image["has_soft_mask"])
            self.assertTrue(image["axis_aligned"])

    def test_transformed_image_keeps_corners_and_axis_aligned_envelope(self):
        writer = PdfWriter()
        page = writer.add_blank_page(width=100, height=100)
        image = DecodedStreamObject()
        image.set_data(bytes([0, 0, 0]))
        image.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(1),
            NameObject("/Height"): NumberObject(1),
            NameObject("/ColorSpace"): NameObject("/DeviceGray"),
            NameObject("/BitsPerComponent"): NumberObject(8),
        })
        image_ref = writer._add_object(image)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Im"): image_ref})
        })
        content = DecodedStreamObject()
        content.set_data(b"q 0 1 -1 0 30 40 cm /Im Do Q")
        page[NameObject("/Contents")] = writer._add_object(content)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rotated.pdf"
            with path.open("wb") as output:
                writer.write(output)
            result = inspect_page_image_placements(PdfReader(str(path)).pages[0])
        placement = result["placements"][0]
        self.assertEqual(placement["bbox"], (29.0, 40.0, 30.0, 41.0))
        self.assertFalse(placement["axis_aligned"])
        self.assertEqual(len(placement["transformed_corners"]), 4)

    def test_form_xobject_is_not_misreported_as_image(self):
        writer = PdfWriter()
        page = writer.add_blank_page(width=100, height=100)
        form = DecodedStreamObject()
        form.set_data(b"")
        form.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(10), NumberObject(10)]),
            NameObject("/Resources"): DictionaryObject(),
        })
        form_ref = writer._add_object(form)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Fm"): form_ref})
        })
        content = DecodedStreamObject()
        content.set_data(b"/Fm Do")
        page[NameObject("/Contents")] = writer._add_object(content)
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "form.pdf"
            with path.open("wb") as output:
                writer.write(output)
            report = inspect_page_image_placements(PdfReader(str(path)).pages[0])
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["placements"], [])
        self.assertEqual(report["counts"]["forms_visited"], 1)


    def _nested_form_image_fixture(self, path, clipped=False):
        writer = PdfWriter()
        page = writer.add_blank_page(width=500, height=500)
        image = DecodedStreamObject()
        image.set_data(bytes([0]))
        image.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(1),
            NameObject("/Height"): NumberObject(1),
            NameObject("/ColorSpace"): NameObject("/DeviceGray"),
            NameObject("/BitsPerComponent"): NumberObject(8),
        })
        image_ref = writer._add_object(image)
        inner_resources = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Im"): image_ref})
        })
        clip_ops = b"0 0 10 10 re W n " if clipped else b""
        inner = DecodedStreamObject()
        inner.set_data(clip_ops + b"q 50 0 0 30 2 3 cm /Im Do Q")
        inner.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(80), NumberObject(60)]),
            NameObject("/Matrix"): ArrayObject([NumberObject(1), NumberObject(0), NumberObject(0), NumberObject(1), NumberObject(10), NumberObject(20)]),
            NameObject("/Resources"): inner_resources,
        })
        inner_ref = writer._add_object(inner)
        outer_resources = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Inner"): inner_ref})
        })
        outer = DecodedStreamObject()
        outer.set_data(b"/Inner Do")
        outer.update({
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Form"),
            NameObject("/BBox"): ArrayObject([NumberObject(0), NumberObject(0), NumberObject(100), NumberObject(80)]),
            NameObject("/Matrix"): ArrayObject([NumberObject(2), NumberObject(0), NumberObject(0), NumberObject(2), NumberObject(100), NumberObject(200)]),
            NameObject("/Resources"): outer_resources,
        })
        outer_ref = writer._add_object(outer)
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/XObject"): DictionaryObject({NameObject("/Outer"): outer_ref})
        })
        content = DecodedStreamObject()
        content.set_data(b"/Outer Do")
        page[NameObject("/Contents")] = writer._add_object(content)
        with Path(path).open("wb") as output:
            writer.write(output)
        return Path(path)

    def test_recurses_nested_forms_and_composes_form_and_image_matrices(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self._nested_form_image_fixture(Path(temp) / "nested-image.pdf")
            report = inspect_page_image_placements(PdfReader(str(path)).pages[0])
        self.assertEqual(report["status"], "ok")
        self.assertEqual(report["counts"]["forms_visited"], 2)
        self.assertEqual(len(report["placements"]), 1)
        image = report["placements"][0]
        self.assertEqual(image["form_path"], ["/Outer", "/Inner"])
        self.assertEqual(image["bbox"], (124.0, 246.0, 224.0, 306.0))
        self.assertEqual(len(image["form_bbox_clips"]), 2)

    def test_nested_arbitrary_clipping_is_reported_as_incomplete(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self._nested_form_image_fixture(Path(temp) / "nested-clipped.pdf", clipped=True)
            report = inspect_page_image_placements(PdfReader(str(path)).pages[0])
        self.assertEqual(report["status"], "incomplete")
        self.assertEqual(len(report["placements"]), 1)
        self.assertTrue(report["placements"][0]["arbitrary_clip_unresolved"])
        self.assertTrue(any(item["reason"] == "arbitrary-clipping-path-not-evaluated" for item in report["unknown"]))

    def test_form_depth_limit_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            path = self._nested_form_image_fixture(Path(temp) / "depth.pdf")
            report = inspect_page_image_placements(PdfReader(str(path)).pages[0], max_depth=1)
        self.assertEqual(report["status"], "incomplete")
        self.assertEqual(report["placements"], [])
        self.assertTrue(any(item["reason"] == "form-depth-limit" for item in report["unknown"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
