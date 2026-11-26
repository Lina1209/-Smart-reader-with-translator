"""Read-only extraction of page-level PDF image XObject placement bounds.

Only page-level image Do operations are resolved. Form XObjects are reported
as unsupported/incomplete; no recursive resource walk or clip evaluation.
"""
import math


IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def multiply_matrices(left, right):
    """Compose PDF affine matrices using x'=a*x+c*y+e, y'=b*x+d*y+f."""
    if len(left) != 6 or len(right) != 6:
        raise ValueError("PDF matrices must contain six values")
    a, b, c, d, e, f = map(float, left)
    g, h, i, j, k, l = map(float, right)
    values = (
        a*g + c*h, b*g + d*h,
        a*i + c*j, b*i + d*j,
        a*k + c*l + e, b*k + d*l + f,
    )
    if not all(math.isfinite(value) for value in values):
        raise ValueError("non-finite PDF matrix")
    return values


def transform_point(matrix, x, y):
    a, b, c, d, e, f = matrix
    return (a*x + c*y + e, b*x + d*y + f)


def _resolve(value):
    return value.get_object() if hasattr(value, "get_object") else value


def inspect_page_image_placements(page):
    """Return image unit-square bounds for page-level image XObject invocations."""
    resources = _resolve(page.get("/Resources", {}))
    xobjects = _resolve(resources.get("/XObject", {}))
    ctm = IDENTITY
    stack = []
    placements, unknown = [], []
    operations = page.get_contents().operations if page.get_contents() else []

    for index, (operands, operator) in enumerate(operations):
        try:
            if operator == b"q":
                stack.append(ctm)
            elif operator == b"Q":
                if not stack:
                    unknown.append({"operator_index": index, "reason": "unmatched-Q"})
                else:
                    ctm = stack.pop()
            elif operator == b"cm":
                if len(operands) != 6:
                    raise ValueError("malformed-cm")
                ctm = multiply_matrices(ctm, tuple(float(v) for v in operands))
            elif operator == b"Do":
                if not operands:
                    raise ValueError("missing-Do-resource")
                name = str(operands[0])
                target = _resolve(xobjects.get(name))
                if target is None:
                    unknown.append({"operator_index": index, "resource": name, "reason": "missing-xobject"})
                    continue
                subtype = str(target.get("/Subtype", ""))
                if subtype != "/Image":
                    unknown.append({"operator_index": index, "resource": name, "reason": "non-image-xobject-not-recursed"})
                    continue
                corners = [
                    transform_point(ctm, 0, 0), transform_point(ctm, 1, 0),
                    transform_point(ctm, 1, 1), transform_point(ctm, 0, 1),
                ]
                xs, ys = [p[0] for p in corners], [p[1] for p in corners]
                placements.append({
                    "operator_index": index,
                    "resource": name,
                    "bbox": (min(xs), min(ys), max(xs), max(ys)),
                    "transformed_corners": corners,
                    "matrix": ctm,
                    "width_pixels": int(target.get("/Width", 0)),
                    "height_pixels": int(target.get("/Height", 0)),
                    "color_space": str(target.get("/ColorSpace", "unknown")),
                    "has_soft_mask": target.get("/SMask") is not None,
                    "axis_aligned": abs(ctm[1]) < 1e-9 and abs(ctm[2]) < 1e-9,
                })
        except (TypeError, ValueError, OverflowError, KeyError) as error:
            unknown.append({"operator_index": index, "reason": str(error)})

    if stack:
        unknown.append({"reason": "unclosed-q-stack", "depth": len(stack)})
    return {
        "status": "incomplete" if unknown else "ok",
        "placements": placements,
        "unknown": unknown,
        "coordinate_space": "page user space (PDF bottom-left convention)",
        "limitations": [
            "Only page-level image XObjects are resolved; Form XObjects are not traversed.",
            "Clipping paths, page rotation/crop-box normalization, transparency and z-order are not evaluated.",
            "Bounding boxes are axis-aligned envelopes; transformed corners are retained for rotated/sheared images.",
            "This is read-only geometry evidence, not proof of visible obstruction or a PDF rewrite.",
        ],
    }
