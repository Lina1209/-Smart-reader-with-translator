"""Conservative rectangle overlap checks for PDF layout diagnostics.

Coordinates must already be in one common, page-space coordinate system.
This module does not discover image/table/clip regions from PDF content.
"""

import math


def _rect(value):
    if not isinstance(value, (tuple, list)) or len(value) != 4:
        return None
    try:
        x0, y0, x1, y1 = (float(part) for part in value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not all(math.isfinite(part) for part in (x0, y0, x1, y1)):
        return None
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, y0, x1, y1)


def intersection_area(first, second):
    """Return positive intersection area, or None for invalid rectangles."""
    a, b = _rect(first), _rect(second)
    if a is None or b is None:
        return None
    width = min(a[2], b[2]) - max(a[0], b[0])
    height = min(a[3], b[3]) - max(a[1], b[1])
    if width <= 0 or height <= 0:
        return 0.0
    return width * height


def overlap_report(text_rect, obstacle_rects, min_overlap_area=0.0):
    """Report intersections between one text box and explicitly supplied obstacles.

    Touching edges are not overlaps. Invalid boxes are rejected; invalid obstacle
    entries are listed as unknown rather than silently ignored.
    """
    text_box = _rect(text_rect)
    try:
        threshold = float(min_overlap_area)
    except (TypeError, ValueError, OverflowError):
        threshold = -1
    if text_box is None or not math.isfinite(threshold) or threshold < 0:
        return {"status": "invalid-input", "overlaps": [], "unknown_obstacles": []}

    overlaps, unknown = [], []
    for index, candidate in enumerate(obstacle_rects):
        area = intersection_area(text_box, candidate)
        if area is None:
            unknown.append(index)
        elif area > threshold:
            overlaps.append({"obstacle_index": index, "intersection_area": area})

    return {
        "status": "overlap" if overlaps else ("incomplete" if unknown else "clear"),
        "overlaps": overlaps,
        "unknown_obstacles": unknown,
        "text_box": text_box,
        "obstacle_count": len(obstacle_rects),
        "coordinate_space": "caller-supplied common page-space coordinates",
        "limitations": [
            "Obstacle rectangles must be discovered and transformed by a separate PDF parser.",
            "Axis-aligned boxes do not resolve rotated glyph outlines or exact clipping paths.",
            "Intersection does not prove visual occlusion; transparency, z-order and blend modes are not evaluated.",
            "No automatic PDF rewrite or text movement is performed.",
        ],
    }
