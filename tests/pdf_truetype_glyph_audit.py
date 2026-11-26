"""Read-only inspection of embedded TrueType glyph inventory and outlines."""

from io import BytesIO


def inspect_truetype_glyph(font_program, gid, max_component_depth=16, max_components=256):
    if not isinstance(font_program, (bytes, bytearray)) or not font_program:
        return {"status": "invalid-font-program", "gid": gid, "glyph_name": None}
    if not isinstance(gid, int) or gid < 0 or gid > 0xFFFF:
        return {"status": "invalid-gid", "gid": gid, "glyph_name": None}

    try:
        from fontTools.ttLib import TTFont
        font = TTFont(BytesIO(bytes(font_program)), lazy=False, recalcBBoxes=False, recalcTimestamp=False)
    except Exception as exc:
        return {
            "status": "unreadable-font",
            "gid": gid,
            "glyph_name": None,
            "error": type(exc).__name__,
        }

    try:
        if "maxp" not in font or "head" not in font or "glyf" not in font or "loca" not in font:
            return {"status": "unsupported-outline-flavor", "gid": gid, "glyph_name": None}
        order = font.getGlyphOrder()
        if gid >= len(order):
            return {
                "status": "gid-out-of-range",
                "gid": gid,
                "glyph_count": len(order),
                "glyph_name": None,
            }

        glyph_name = order[gid]
        glyph_table = font["glyf"]
        active = set()
        component_count = 0
        errors = []

        def inspect(name, depth):
            nonlocal component_count
            if depth > max_component_depth:
                errors.append("composite-depth-limit")
                return
            if name in active:
                errors.append("composite-cycle")
                return
            if name not in glyph_table:
                errors.append("missing-component-glyph:" + name)
                return
            active.add(name)
            try:
                glyph = glyph_table[name]
                contours = getattr(glyph, "numberOfContours", 0)
                if contours >= 0:
                    return
                for component in getattr(glyph, "components", []):
                    component_count += 1
                    if component_count > max_components:
                        errors.append("composite-component-limit")
                        return
                    inspect(component.glyphName, depth + 1)
            finally:
                active.remove(name)

        inspect(glyph_name, 0)
        glyph = glyph_table[glyph_name]
        contours = int(getattr(glyph, "numberOfContours", 0))
        if errors:
            status = "incomplete-composite"
        elif contours > 0:
            status = "outline-present"
        elif contours == 0:
            status = "empty-glyph"
        else:
            status = "composite-outline-present" if component_count else "composite-without-components"

        cmap = font.getBestCmap() or {}
        unicode_scalars = sorted(
            codepoint for codepoint, mapped_name in cmap.items()
            if mapped_name == glyph_name
        )

        # Font-program metrics are reported separately from PDF /Widths and /W.
        units_per_em = int(font["head"].unitsPerEm)
        metric_report = {"status": "unknown", "advance_width": None, "left_side_bearing": None}
        if "hmtx" in font and glyph_name in font["hmtx"].metrics:
            advance, side_bearing = font["hmtx"].metrics[glyph_name]
            metric_report = {
                "status": "available",
                "advance_width": int(advance),
                "left_side_bearing": int(side_bearing),
                "advance_width_per_1000_em": round(advance * 1000 / units_per_em, 4) if units_per_em else None,
                "left_side_bearing_per_1000_em": round(side_bearing * 1000 / units_per_em, 4) if units_per_em else None,
            }

        bounds = {"status": "unavailable", "x_min": None, "y_min": None, "x_max": None, "y_max": None}
        try:
            glyph.recalcBounds(glyph_table)
            values = (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax)
            if all(value is not None for value in values):
                bounds = {
                    "status": "available",
                    "x_min": int(values[0]),
                    "y_min": int(values[1]),
                    "x_max": int(values[2]),
                    "y_max": int(values[3]),
                    "width": int(values[2] - values[0]),
                    "height": int(values[3] - values[1]),
                    "width_per_1000_em": round((values[2] - values[0]) * 1000 / units_per_em, 4) if units_per_em else None,
                    "height_per_1000_em": round((values[3] - values[1]) * 1000 / units_per_em, 4) if units_per_em else None,
                }
        except Exception:
            pass

        return {
            "status": status,
            "gid": gid,
            "glyph_name": glyph_name,
            "glyph_count": len(order),
            "number_of_contours": contours,
            "composite_component_count": component_count,
            "unicode_codepoints": unicode_scalars[:32],
            "unicode_codepoint_count": len(unicode_scalars),
            "units_per_em": units_per_em,
            "horizontal_metrics": metric_report,
            "outline_bounds": bounds,
            "outline_flavor": "TrueType glyf/loca",
            "errors": errors,
            "limitations": [
                "This checks TrueType glyf/loca structure, not rendered pixel appearance.",
                "CFF/OpenType-CFF, Type1 and CIDFontType0 outlines are not handled.",
                "Presence of an outline does not prove PDF clipping, shaping, metrics or translated-text fit.",
                "A glyph's Unicode cmap entry is supporting evidence, not a replacement for PDF Encoding/ToUnicode mapping.",
            ],
        }
    except Exception as exc:
        return {
            "status": "glyph-inspection-error",
            "gid": gid,
            "glyph_name": None,
            "error": type(exc).__name__,
        }
    finally:
        try:
            font.close()
        except Exception:
            pass
