"""Conservative recursive extraction of PDF image placements.

This is a read-only diagnostic. It follows Form XObjects with bounded depth,
composes their matrices, retains transformed Form BBoxes, and marks arbitrary
clipping paths as unresolved instead of claiming an exact visible region.
"""
import math

IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
_PATH_ENDING = {"S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"}


def multiply_matrices(left, right):
    """Compose PDF affine matrices using x'=a*x+c*y+e, y'=b*x+d*y+f."""
    if len(left) != 6 or len(right) != 6:
        raise ValueError("PDF matrices must contain six values")
    a, b, c, d, e, f = map(float, left)
    g, h, i, j, k, l = map(float, right)
    values = (a*g + c*h, b*g + d*h, a*i + c*j, b*i + d*j,
              a*k + c*l + e, b*k + d*l + f)
    if not all(math.isfinite(value) for value in values):
        raise ValueError("non-finite PDF matrix")
    return values


def transform_point(matrix, x, y):
    a, b, c, d, e, f = matrix
    return (a*x + c*y + e, b*x + d*y + f)


def _resolve(value):
    seen = set()
    while hasattr(value, "get_object"):
        marker = id(value)
        if marker in seen:
            raise ValueError("cyclic-indirect-object")
        seen.add(marker)
        next_value = value.get_object()
        if next_value is value:
            break
        value = next_value
    return value


def _operator_name(operator):
    return operator.decode("latin-1", errors="replace") if isinstance(operator, bytes) else str(operator)


def _resource_lookup(resources, name):
    if not hasattr(resources, "items"):
        return None
    value = resources.get(name)
    if value is None:
        try:
            from pypdf.generic import NameObject
            value = resources.get(NameObject(name))
        except (ImportError, TypeError, ValueError):
            pass
    if value is None:
        value = next((candidate for key, candidate in resources.items() if str(key) == name), None)
    return _resolve(value) if value is not None else None


def _corners(matrix, box=(0, 0, 1, 1)):
    x0, y0, x1, y1 = box
    return [
        transform_point(matrix, x0, y0), transform_point(matrix, x1, y0),
        transform_point(matrix, x1, y1), transform_point(matrix, x0, y1),
    ]


def _bbox(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    return (min(xs), min(ys), max(xs), max(ys))


def _form_bbox(form, matrix, index, path):
    raw = form.get("/BBox")
    if raw is None or len(raw) != 4:
        return None
    values = tuple(float(v) for v in raw)
    if not all(math.isfinite(v) for v in values) or values[2] <= values[0] or values[3] <= values[1]:
        return None
    points = _corners(matrix, values)
    return {"operator_index": index, "form_path": list(path), "corners": points, "bbox": _bbox(points)}


def inspect_page_image_placements(page, max_depth=12, max_forms=512):
    """Return nested image placements and explicit unknown geometry evidence."""
    placements, unknown, form_clips = [], [], []
    counters = {"forms_visited": 0, "image_invocations": 0}
    page_resources = _resolve(page.get("/Resources", {}))
    page_content = page.get_contents()

    if page_content is None:
        return {
            "status": "ok", "placements": [], "unknown": [], "form_clips": [],
            "counts": counters, "coordinate_space": "page user space (PDF bottom-left convention)",
            "limitations": ["Page has no content stream; inherited resources and annotations are not inspected."],
        }

    def walk(operations, resources, initial_ctm, form_path, active_forms, depth, inherited_clips):
        ctm = initial_ctm
        state_stack = []
        clip_pending = False
        local_clips = list(inherited_clips)

        for index, (operands, raw_operator) in enumerate(operations):
            operator = _operator_name(raw_operator)
            try:
                if operator == "q":
                    state_stack.append((ctm, clip_pending, list(local_clips)))
                elif operator == "Q":
                    if not state_stack:
                        unknown.append({"form_path": list(form_path), "operator_index": index, "reason": "unmatched-Q"})
                    else:
                        ctm, clip_pending, local_clips = state_stack.pop()
                elif operator == "cm":
                    if len(operands) != 6:
                        raise ValueError("malformed-cm")
                    ctm = multiply_matrices(ctm, tuple(float(v) for v in operands))
                elif operator in ("W", "W*"):
                    clip_pending = True
                elif operator in _PATH_ENDING:
                    if clip_pending:
                        local_clips.append({
                            "form_path": list(form_path), "operator_index": index,
                            "reason": "arbitrary-clipping-path-not-evaluated",
                        })
                        unknown.append({
                            "form_path": list(form_path), "operator_index": index,
                            "reason": "arbitrary-clipping-path-not-evaluated",
                        })
                        clip_pending = False
                elif operator == "Do":
                    if not operands:
                        raise ValueError("missing-Do-resource")
                    name = str(operands[0])
                    xobjects = _resolve(resources.get("/XObject", {})) if hasattr(resources, "get") else {}
                    target = _resource_lookup(xobjects, name)
                    if target is None:
                        unknown.append({"form_path": list(form_path), "operator_index": index,
                                        "resource": name, "reason": "missing-xobject"})
                        continue
                    subtype = str(target.get("/Subtype", ""))
                    current_path = form_path + [name]
                    if subtype == "/Image":
                        points = _corners(ctm)
                        counters["image_invocations"] += 1
                        placements.append({
                            "operator_index": index, "resource": name,
                            "form_path": list(form_path),
                            "bbox": _bbox(points), "transformed_corners": points,
                            "matrix": ctm, "width_pixels": int(target.get("/Width", 0)),
                            "height_pixels": int(target.get("/Height", 0)),
                            "color_space": str(target.get("/ColorSpace", "unknown")),
                            "has_soft_mask": target.get("/SMask") is not None,
                            "axis_aligned": abs(ctm[1]) < 1e-9 and abs(ctm[2]) < 1e-9,
                            "form_bbox_clips": list(inherited_clips),
                            "arbitrary_clip_unresolved": bool(local_clips),
                        })
                    elif subtype == "/Form":
                        counters["forms_visited"] += 1
                        if depth >= max_depth:
                            unknown.append({"form_path": current_path, "reason": "form-depth-limit", "limit": max_depth})
                            continue
                        if counters["forms_visited"] > max_forms:
                            unknown.append({"form_path": current_path, "reason": "form-count-limit", "limit": max_forms})
                            return
                        marker = id(target)
                        if marker in active_forms:
                            unknown.append({"form_path": current_path, "reason": "recursive-form-cycle"})
                            continue
                        form_matrix = target.get("/Matrix", IDENTITY)
                        if len(form_matrix) != 6:
                            unknown.append({"form_path": current_path, "reason": "invalid-form-matrix"})
                            continue
                        child_ctm = multiply_matrices(ctm, tuple(float(v) for v in form_matrix))
                        clip = _form_bbox(target, child_ctm, index, current_path)
                        if clip is None:
                            unknown.append({"form_path": current_path, "reason": "missing-or-invalid-form-bbox"})
                        else:
                            form_clips.append(clip)
                        child_resources_raw = target.get("/Resources")
                        child_resources = _resolve(child_resources_raw) if child_resources_raw is not None else resources
                        child_content = target.get_data()
                        from pypdf.generic import ContentStream
                        child_stream = ContentStream(target, page.pdf)
                        walk(child_stream.operations, child_resources, child_ctm, current_path,
                             active_forms | {marker}, depth + 1, local_clips + ([clip] if clip else []))
                    else:
                        unknown.append({"form_path": list(form_path), "operator_index": index,
                                        "resource": name, "reason": "unsupported-xobject-subtype"})
            except (TypeError, ValueError, OverflowError, KeyError, AttributeError) as error:
                unknown.append({"form_path": list(form_path), "operator_index": index,
                                "reason": str(error) or "malformed-operation"})

        if state_stack:
            unknown.append({"form_path": list(form_path), "reason": "unclosed-q-stack", "depth": len(state_stack)})
        if clip_pending:
            unknown.append({"form_path": list(form_path), "reason": "unfinished-clipping-path"})

    operations = getattr(page_content, "operations", None)
    if operations is None:
        unknown.append({"reason": "page-content-stream-operations-unavailable"})
    else:
        walk(operations, page_resources, IDENTITY, [], set(), 0, [])

    return {
        "status": "incomplete" if unknown else "ok",
        "placements": placements, "unknown": unknown, "form_clips": form_clips,
        "counts": counters,
        "coordinate_space": "page user space (PDF bottom-left convention)",
        "limitations": [
            "Nested Form XObjects are traversed with bounded recursion and local resource dictionaries.",
            "Form /Matrix and /BBox are applied and retained as transformed quadrilaterals; nested clip intersections are not calculated.",
            "Arbitrary W/W* clipping paths are detected but not geometrically evaluated; affected results are incomplete.",
            "Page rotation/crop-box normalization, transparency groups, optional content, annotations and z-order are not fully evaluated.",
            "Image boxes are geometric placements, not proof that every pixel is visible or obstructs translated text.",
            "This is read-only diagnostic evidence, not a PDF rewrite.",
        ],
    }
