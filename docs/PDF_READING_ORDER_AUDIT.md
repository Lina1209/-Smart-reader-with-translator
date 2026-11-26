# PDF reading-order / layout diagnostic

`tests/pdf_reading_order_audit.py` is a conservative diagnostic for caller-provided text-item rectangles and optional named regions. It groups items into horizontal bands, coarse x clusters, tags items overlapping supplied regions, and flags a possible right-to-left sequence jump within a row.

It does **not** extract text from PDFs, detect tables, infer semantic columns, establish true reading order, handle RTL/rotated/mixed layouts reliably, or repair/translate documents. Input coordinates must already be normalized to the same page space. This is a heuristic for review only; production behavior is unchanged.

Tests: `python -m unittest discover -s tests -p 'test_pdf_reading_order_audit.py' -v`.
