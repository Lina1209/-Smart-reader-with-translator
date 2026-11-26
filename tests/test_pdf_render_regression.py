#!/usr/bin/env python3
"""Render PDF fixtures and compare visual and text geometry after a no-op round trip."""
import subprocess
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader, PdfWriter

from generate_pdf_fixtures import build_fixtures
from test_pdf_real_fixtures import (
    add_identity_h_cidfonttype2_fixture,
    add_nested_form_and_clipping_fixture,
    add_tj_spacing_fixture,
    add_transparency_image_overlay_fixture,
)


def build_render_suite(directory):
    paths = [
        build_fixtures(directory / "reportlab-fixtures.pdf"),
        add_identity_h_cidfonttype2_fixture(directory / "identity-h.pdf"),
        add_tj_spacing_fixture(directory / "tj.pdf"),
        add_nested_form_and_clipping_fixture(directory / "nested-forms.pdf"),
        add_transparency_image_overlay_fixture(directory / "transparency-overlay.pdf"),
    ]
    writer = PdfWriter()
    for path in paths:
        writer.append_pages_from_reader(PdfReader(str(path)))
    combined = directory / "render-suite.pdf"
    with combined.open("wb") as output:
        writer.write(output)
    return combined


def render_pdf(pdf_path, output_prefix):
    subprocess.run(
        ["pdftoppm", "-png", "-r", "96", str(pdf_path), str(output_prefix)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=90,
    )
    return sorted(output_prefix.parent.glob(output_prefix.name + "-*.png"))


class PdfWordBoxes(HTMLParser):
    def __init__(self):
        super().__init__()
        self.pages = []
        self.current_page = None
        self.current_box = None
        self.words = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "page":
            self.current_page = {
                "width": float(values["width"]),
                "height": float(values["height"]),
                "words": [],
            }
            self.pages.append(self.current_page)
        elif tag == "word" and self.current_page is not None:
            self.current_box = tuple(float(values[key]) for key in ("xmin", "ymin", "xmax", "ymax"))
            self.words = []

    def handle_data(self, data):
        if self.current_box is not None:
            self.words.append(data)

    def handle_endtag(self, tag):
        if tag == "word" and self.current_page is not None and self.current_box is not None:
            self.current_page["words"].append(("".join(self.words), self.current_box))
            self.current_box = None
            self.words = []


def extract_word_boxes(pdf_path):
    result = subprocess.run(
        ["pdftotext", "-bbox-layout", str(pdf_path), "-"],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=90,
    )
    parser = PdfWordBoxes()
    parser.feed(result.stdout)
    return parser.pages


def round_trip_pdf(source, destination):
    reader = PdfReader(str(source))
    writer = PdfWriter()
    writer.append_pages_from_reader(reader)
    with destination.open("wb") as output:
        writer.write(output)


class PdfRenderRegressionTests(unittest.TestCase):
    def test_noop_round_trip_preserves_word_order_and_page_coordinates(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = build_render_suite(directory)
            rewritten = directory / "round-trip.pdf"
            round_trip_pdf(source, rewritten)

            before_pages = extract_word_boxes(source)
            after_pages = extract_word_boxes(rewritten)
            self.assertEqual(len(before_pages), 8)
            self.assertEqual(len(after_pages), len(before_pages))
            for page_number, (before_page, after_page) in enumerate(zip(before_pages, after_pages), start=1):
                before_words = before_page["words"]
                after_words = after_page["words"]
                self.assertEqual(
                    [word for word, _ in before_words],
                    [word for word, _ in after_words],
                    f"Extracted word order/content changed on page {page_number}",
                )
                self.assertEqual(len(before_words), len(after_words))
                for (before_word, before_box), (after_word, after_box) in zip(before_words, after_words):
                    self.assertEqual(before_word, after_word)
                    for before_value, after_value in zip(before_box, after_box):
                        self.assertLessEqual(
                            abs(before_value - after_value),
                            0.05,
                            f"Word box moved on page {page_number}: {before_word}",
                        )


    def test_word_boxes_stay_inside_page_boundaries(self):
        with tempfile.TemporaryDirectory() as temp:
            source = build_render_suite(Path(temp))
            pages = extract_word_boxes(source)
            self.assertEqual(len(pages), 8)
            for page_number, page in enumerate(pages, start=1):
                width, height = page["width"], page["height"]
                self.assertGreater(width, 0)
                self.assertGreater(height, 0)
                for word, (x_min, y_min, x_max, y_max) in page["words"]:
                    with self.subTest(page=page_number, word=word):
                        self.assertGreaterEqual(x_min, -0.5)
                        self.assertGreaterEqual(y_min, -0.5)
                        self.assertLessEqual(x_max, width + 0.5)
                        self.assertLessEqual(y_max, height + 0.5)
                        self.assertGreater(x_max, x_min)
                        self.assertGreater(y_max, y_min)

    def test_table_words_are_located_inside_their_vector_table_region(self):
        with tempfile.TemporaryDirectory() as temp:
            pages = extract_word_boxes(build_render_suite(Path(temp)))
            table_page = pages[3]
            self.assertAlmostEqual(table_page["width"], 612, delta=0.1)
            self.assertAlmostEqual(table_page["height"], 792, delta=0.1)
            table_words = {
                word: box for word, box in table_page["words"]
                if word.startswith("TABLE_") or word in {"Item", "Amount", "Translation", "1250"}
            }
            for expected in ("TABLE_HEADER:", "Item", "Amount", "TABLE_CELL:", "Translation", "1250"):
                self.assertIn(expected, table_words, "Missing table word " + expected)
            for word, (x_min, y_min, x_max, y_max) in table_words.items():
                with self.subTest(word=word):
                    self.assertGreaterEqual(x_min, 53)
                    self.assertLessEqual(x_max, 415)
                    self.assertGreaterEqual(y_min, 70)
                    self.assertLessEqual(y_max, 144)

    def test_overlay_text_bbox_intersects_declared_image_area(self):
        with tempfile.TemporaryDirectory() as temp:
            pages = extract_word_boxes(build_render_suite(Path(temp)))
            overlay_page = pages[7]
            matches = [box for word, box in overlay_page["words"] if word == "TEXT_OVER_IMAGE"]
            self.assertEqual(len(matches), 1, "Expected the text-over-image fixture label")
            x_min, y_min, x_max, y_max = matches[0]
            image_left, image_right = 100, 260
            image_top, image_bottom = 792 - 500, 792 - 400
            self.assertGreaterEqual(x_min, image_left - 1)
            self.assertLessEqual(x_max, image_right + 1)
            self.assertGreaterEqual(y_min, image_top - 2)
            self.assertLessEqual(y_max, image_bottom + 2)

    def test_noop_round_trip_keeps_rendered_pages_visually_stable(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            source = build_render_suite(directory)
            rewritten = directory / "round-trip.pdf"
            round_trip_pdf(source, rewritten)

            source_images = render_pdf(source, directory / "before")
            rewritten_images = render_pdf(rewritten, directory / "after")
            self.assertEqual(len(source_images), 8)
            self.assertEqual(len(rewritten_images), len(source_images))

            page_differences = []
            for before_path, after_path in zip(source_images, rewritten_images):
                with Image.open(before_path).convert("RGB") as before, Image.open(after_path).convert("RGB") as after:
                    self.assertEqual(before.size, after.size, "Page dimensions changed during no-op rewrite")
                    diff = ImageChops.difference(before, after)
                    changed = sum(1 for value in diff.convert("L").getdata() if value > 8)
                    total = before.width * before.height
                    page_differences.append(changed / total)
            self.assertLessEqual(
                max(page_differences),
                0.0005,
                f"Rendered page pixels changed beyond tolerance: {page_differences}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
