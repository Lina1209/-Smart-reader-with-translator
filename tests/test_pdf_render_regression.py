#!/usr/bin/env python3
"""Render PDF fixtures before/after a no-op pypdf round trip and compare pixels.

This checks renderer-visible serialization stability only; it does not test translation.
"""
import subprocess
from html.parser import HTMLParser
import tempfile
import unittest
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
        self.words = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "page":
            self.current_page = []
            self.pages.append(self.current_page)
        elif tag == "word" and self.current_page is not None:
            box = tuple(float(values[key]) for key in ("xMin", "yMin", "xMax", "yMax"))
            self.current_page.append((" ".join(self.words), box))
            self.words = []

    def handle_data(self, data):
        self.words.append(data.strip())

    def handle_endtag(self, tag):
        if tag == "word":
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
            for page_number, (before_words, after_words) in enumerate(zip(before_pages, after_pages), start=1):
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
