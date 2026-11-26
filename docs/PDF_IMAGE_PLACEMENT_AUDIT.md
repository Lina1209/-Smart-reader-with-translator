# PDF image placement audit — read-only prototype

The module `tests/pdf_image_placement.py` extracts geometric placement evidence for image XObjects invoked by PDF page content streams.

## Supported traversal

- Resolves page and nested Form XObject resource dictionaries.
- Traverses nested Form XObjects with a configurable depth limit (default 12) and invocation cap (default 512).
- Composes the current transformation matrix with each Form `/Matrix` and image placement matrix.
- Retains the four transformed corners and an axis-aligned envelope for each image.
- Records each image's resource path, pixel dimensions, color space and soft-mask presence.
- Transforms each Form `/BBox` into page user space and retains the quadrilateral as a conservative clipping boundary.
- Detects arbitrary `W` / `W*` clipping operations and marks the report incomplete rather than claiming to have evaluated their exact geometry.
- Reports missing resources, malformed matrices, recursion cycles, unclosed graphics-state stacks and depth/count limits as unknown evidence.

## Important limits

This is not a complete PDF graphics interpreter. It does not calculate intersections between nested Form BBoxes, arbitrary clipping paths, page CropBox/Rotate normalization, transparency groups, optional content, annotations or z-order. Form BBoxes are retained as transformed quadrilaterals, not collapsed into a false claim of exact visible pixels. When arbitrary clipping is present, the result is explicitly `incomplete`.

An image placement is not proof that every pixel is visible or that the image obstructs translated text. The module does not modify PDFs and is not yet wired into the browser translation pipeline.

## Tests

Run:

```sh
python -m unittest discover -s tests -p 'test_pdf_image_placement.py' -v
```

Tests cover page-level image placement, soft masks, affine matrix composition, nested Forms and local resource dictionaries, Form matrices, transformed BBoxes, arbitrary clipping detection and bounded recursion. Fixtures are synthetic PDFs generated in the test suite; they are not real user documents.
