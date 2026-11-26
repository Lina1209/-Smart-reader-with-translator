#!/usr/bin/env python3
"""Generate deterministic, temporary PDF fixtures for native-text diagnostics."""
from pathlib import Path

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


def _dejavu_path():
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).is_file():
            return candidate
    raise RuntimeError("DejaVu Sans missing; install fonts-dejavu-core")


def build_fixtures(output_path):
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if "FixtureDejaVu" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("FixtureDejaVu", _dejavu_path()))
    if "HeiseiMin-W3" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(UnicodeCIDFont("HeiseiMin-W3"))

    doc = canvas.Canvas(str(output_path), pagesize=(612, 792), pageCompression=0)

    # Page 1: simple Type1 / WinAnsi text.
    doc.setFont("Helvetica", 12)
    doc.drawString(54, 730, "WINANSI_FIXTURE: Invoice 12345")
    doc.drawString(54, 710, "Cafe facade - ASCII punctuation")
    doc.showPage()

    # Page 2: embedded subset TrueType font, including Kazakh-specific letters.
    doc.setFont("FixtureDejaVu", 12)
    doc.drawString(54, 730, "UNICODE_FIXTURE: Привет, мир")
    doc.drawString(54, 708, "KAZAKH_FIXTURE: Әә Ғғ Ққ Ңң Өө Ұұ Үү Һһ Іі")
    doc.drawString(54, 686, "ACCENTS_FIXTURE: Élève, façade")
    doc.showPage()

    # Page 3: a genuine Type0/CID font resource with a Unicode CMap.
    doc.setFont("HeiseiMin-W3", 12)
    doc.drawString(54, 730, "CID_FIXTURE: 日本語テスト")
    doc.showPage()

    # Page 4: text inside vector table rules plus a rotated text run.
    doc.setLineWidth(0.8)
    doc.rect(54, 650, 360, 70)
    doc.line(54, 685, 414, 685)
    doc.line(234, 650, 234, 720)
    doc.setFont("Helvetica", 10)
    doc.drawString(64, 698, "TABLE_HEADER: Item")
    doc.drawString(244, 698, "TABLE_HEADER: Amount")
    doc.drawString(64, 665, "TABLE_CELL: Translation")
    doc.drawString(244, 665, "TABLE_CELL: 1250")
    doc.saveState()
    doc.translate(500, 500)
    doc.rotate(90)
    doc.drawString(0, 0, "ROTATED_FIXTURE: Vertical placement")
    doc.restoreState()
    doc.showPage()

    doc.save()
    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("output", help="Output PDF path")
    args = parser.parse_args()
    print(build_fixtures(args.output))
