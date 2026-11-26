# PDF image placement audit — read-only prototype

The module `tests/pdf_image_placement.py` extracts geometric placement evidence for image XObjects invoked by PDF page content streams.

## Supported traversal

- Resolves page and nested Form XObject resource dictionaries.
- Traverses nested Form XObjects with a configurable depth limit (default 12) and invocation cap (default 512).
- Composes the current transformation matrix with each Form `/Matrix` and image placement matrix.
- Retains the four transformed corners and an axis-aligned envelope for each image.
- Records each image's resource path, pixel dimensions, color space and soft-mask presence.
- Transforms each Form `/BBox` into page user space and intersects the image placement polygon with every enclosing Form BBox polygon using convex-polygon clipping. Reports the resulting candidate visible polygon, bounds and area; also flags placements fully excluded by Form BBoxes.
- Detects arbitrary `W` / `W*` clipping operations and marks the report incomplete rather than claiming to have evaluated their exact geometry.
- Reports missing resources, malformed matrices, recursion cycles, unclosed graphics-state stacks and depth/count limits as unknown evidence.

## Important limits

This is not a complete PDF graphics interpreter. It calculates intersections between the image unit-square polygon and enclosing transformed Form BBox polygons, but does not evaluate arbitrary clipping paths, page CropBox/Rotate normalization, transparency groups, optional content, annotations or z-order. The resulting polygon is therefore only a candidate after Form BBox clipping, not the exact visible-pixel region. When arbitrary clipping is present, the result is explicitly `incomplete`.

An image placement is not proof that every pixel is visible or that the image obstructs translated text. The module does not modify PDFs and is not yet wired into the browser translation pipeline.

## Tests

Run:

```sh
python -m unittest discover -s tests -p 'test_pdf_image_placement.py' -v
```

Tests cover page-level image placement, soft masks, affine matrix composition, nested Forms and local resource dictionaries, Form matrices, nested Form BBox polygon intersections (including partial and full clipping), arbitrary clipping detection and bounded recursion. Fixtures are synthetic PDFs generated in the test suite; they are not real user documents.
