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
        self.current_box = None
        self.words = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == "page":
            self.current_page = []
            self.pages.append(self.current_page)
        elif tag == "word" and self.current_page is not None:
            self.current_box = tuple(float(values[key]) for key in ("xMin", "yMin", "xMax", "yMax"))
            self.words = []

    def handle_data(self, data):
        if self.current_box is not None:
            self.words.append(data)

    def handle_endtag(self, tag):
        if tag == "word" and self.current_page is not None and self.current_box is not None:
            self.current_page.append(("".join(self.words), self.current_box))
            self.current_box = None
            self.words = []

