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
        visited = set()
        component_count = 0
        errors = []

        def inspect(name, depth):
            nonlocal component_count
            if depth > max_component_depth:
                errors.append("composite-depth-limit")
                return
            if name in visited:
                errors.append("composite-cycle-or-repeated-component")
                return
            if name not in glyph_table:
                errors.append("missing-component-glyph:" + name)
                return
            visited.add(name)
            glyph = glyph_table[name]
            contours = getattr(glyph, "numberOfContours", 0)
            if contours == 0:
                return
            if contours > 0:
                return
            for component in getattr(glyph, "components", []):
                component_count += 1
                if component_count > max_components:
                    errors.append("composite-component-limit")
                    return
                inspect(component.glyphName, depth + 1)

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
        return {
            "status": status,
            "gid": gid,
            "glyph_name": glyph_name,
            "glyph_count": len(order),
            "number_of_contours": contours,
            "composite_component_count": component_count,
            "unicode_codepoints": unicode_scalars[:32],
            "unicode_codepoint_count": len(unicode_scalars),
            "units_per_em": int(font["head"].unitsPerEm),
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
