"""Read-only inspection of PDF font dictionaries and mapping evidence.

This module intentionally does not encode text or rewrite PDF content streams.
Width helpers return PDF text-space widths in the font's 1000-unit convention.
"""
import re


def dereference(value):
    return value.get_object() if hasattr(value, "get_object") else value


def _name(value):
    return None if value is None else str(value)


def _stream_bytes(value):
    value = dereference(value)
    if value is None or not hasattr(value, "get_data"):
        return b""
    try:
        return value.get_data()
    except Exception:
        return b""


def _font_program_keys(descriptor):
    descriptor = dereference(descriptor) if descriptor is not None else None
    if descriptor is None:
        return []
    return [key for key in ("/FontFile", "/FontFile2", "/FontFile3") if descriptor.get(key) is not None]


def _simple_width_summary(font):
    first = font.get("/FirstChar")
    widths = dereference(font.get("/Widths"))
    if first is None or widths is None:
        return {"first_char": None, "width_count": 0, "widths_available": False, "sample": []}
    try:
        values = [float(value) for value in widths]
    except (TypeError, ValueError):
        values = []
    return {
        "first_char": int(first),
        "width_count": len(values),
        "widths_available": bool(values),
        "last_char": int(first) + len(values) - 1 if values else None,
        "sample": values[:12],
    }


def lookup_simple_width(font, character_code):
    """Return an explicit simple-font width; never guess standard-font metrics."""
    if not isinstance(character_code, int) or not 0 <= character_code <= 255:
        return {"status": "invalid-code", "width": None, "source": None}
    first = font.get("/FirstChar")
    widths = dereference(font.get("/Widths"))
    if first is not None and widths is not None:
        index = character_code - int(first)
        if 0 <= index < len(widths):
            return {"status": "explicit", "width": float(widths[index]), "source": "/Widths"}
    descriptor = dereference(font.get("/FontDescriptor"))
    if descriptor is not None and descriptor.get("/MissingWidth") is not None:
        return {
            "status": "fallback",
            "width": float(descriptor["/MissingWidth"]),
            "source": "/FontDescriptor/MissingWidth",
        }
    return {"status": "unknown", "width": None, "source": None}


def lookup_cid_width(descendant, cid):
    """Resolve a CID width from /W or /DW using the PDF array grammar."""
    if not isinstance(cid, int) or cid < 0:
        return {"status": "invalid-cid", "width": None, "source": None}
    widths = dereference(descendant.get("/W"))
    if widths:
        items = list(widths)
        index = 0
        while index < len(items):
            try:
                first = int(items[index])
                second = dereference(items[index + 1])
            except (IndexError, TypeError, ValueError):
                return {"status": "malformed-width-array", "width": None, "source": "/W"}
            if isinstance(second, (list, tuple)) or second.__class__.__name__ == "ArrayObject":
                values = dereference(second)
                if first <= cid < first + len(values):
                    try:
                        return {"status": "explicit", "width": float(values[cid - first]), "source": "/W"}
                    except (TypeError, ValueError):
                        return {"status": "malformed-width-array", "width": None, "source": "/W"}
                index += 2
            else:
                try:
                    last = int(second)
                    width = float(items[index + 2])
                except (IndexError, TypeError, ValueError):
                    return {"status": "malformed-width-array", "width": None, "source": "/W"}
                if first <= cid <= last:
                    return {"status": "explicit", "width": width, "source": "/W"}
                index += 3
    default = descendant.get("/DW")
    if default is not None:
        return {"status": "default", "width": float(default), "source": "/DW"}
    return {"status": "unknown", "width": None, "source": None}


def _differences_summary(encoding):
    encoding = dereference(encoding) if encoding is not None else None
    if not hasattr(encoding, "get"):
        return {"base_encoding": _name(encoding), "difference_glyph_count": 0}
    differences = dereference(encoding.get("/Differences"))
    names = [str(item) for item in differences or [] if not isinstance(item, int)]
    return {
        "base_encoding": _name(encoding.get("/BaseEncoding")),
        "difference_glyph_count": len(names),
        "difference_glyph_names_sample": names[:12],
    }


def _tounicode_summary(font):
    cmap = font.get("/ToUnicode")
    if cmap is None:
        return {"present": False, "mapping_section_count": None}
    data = _stream_bytes(cmap)
    sections = len(re.findall(rb"\bbeginbfchar\b|\bbeginbfrange\b", data))
    return {"present": True, "mapping_section_count": sections if data else None}


def _cid_width_summary(descendant):
    widths = dereference(descendant.get("/W"))
    if not widths:
        return {"explicit_widths_present": False, "width_array_item_count": 0}
    return {
        "explicit_widths_present": True,
        "width_array_item_count": len(widths),
        "default_width": float(descendant.get("/DW", 1000)),
    }


def _cid_to_gid_summary(descendant):
    subtype = _name(descendant.get("/Subtype"))
    if subtype != "/CIDFontType2":
        return {"kind": "not-applicable", "byte_length": None}
    mapping = descendant.get("/CIDToGIDMap")
    if mapping is None:
        return {"kind": "default-identity", "byte_length": None}
    mapping = dereference(mapping)
    if _name(mapping) == "/Identity":
        return {"kind": "/Identity", "byte_length": None}
    data = _stream_bytes(mapping)
    return {
        "kind": "stream" if data else "unknown",
        "byte_length": len(data) if data else None,
        "two_byte_entry_count": len(data) // 2 if data else None,
        "odd_byte_length": bool(data and len(data) % 2),
    }


def audit_font_dictionary(font):
    """Return conservative structural evidence for one resolved PDF font dict."""
    font = dereference(font)
    subtype = _name(font.get("/Subtype"))
    result = {
        "subtype": subtype,
        "base_font": _name(font.get("/BaseFont")),
        "to_unicode": _tounicode_summary(font),
        "font_program_embedded": False,
        "font_program_keys": [],
        "encoding": None,
        "simple_widths": None,
        "descendants": [],
        "rewrite_ready": False,
        "limitations": [
            "ToUnicode is extraction evidence, not a reverse encoder.",
            "This audit does not parse complete encoding CMaps or prove code-to-glyph coverage.",
            "Embedded font presence does not prove a requested glyph exists in a subset.",
            "Widths are font text-space metrics; this audit does not apply font size, Tc, Tw, Tz or glyph advances.",
            "No shaping, text-matrix composition or PDF rewrite is performed.",
        ],
    }

    if subtype == "/Type0":
        encoding = dereference(font.get("/Encoding"))
        encoding_data = _stream_bytes(encoding)
        encoding_name = _name(encoding) if not encoding_data else "stream-cmap"
        descendant_items = dereference(font.get("/DescendantFonts")) or []
        for item in descendant_items:
            descendant = dereference(item)
            descriptor = dereference(descendant.get("/FontDescriptor"))
            program_keys = _font_program_keys(descriptor)
            result["descendants"].append({
                "subtype": _name(descendant.get("/Subtype")),
                "base_font": _name(descendant.get("/BaseFont")),
                "default_width": float(descendant.get("/DW", 1000)),
                "widths": _cid_width_summary(descendant),
                "cid_to_gid": _cid_to_gid_summary(descendant),
                "font_program_keys": program_keys,
                "font_program_embedded": bool(program_keys),
            })
        result["encoding"] = {
            "name": encoding_name,
            "cmap_stream_present": bool(encoding_data),
            "vertical_writing_mode_marker": bool(re.search(rb"/WMode\s+1\b", encoding_data)),
        }
        result["font_program_embedded"] = any(item["font_program_embedded"] for item in result["descendants"])
        result["font_program_keys"] = sorted({
            key for item in result["descendants"] for key in item["font_program_keys"]
        })
        result["limitations"].append(
            "Type 0 Encoding CMap, descendant CID widths and CIDToGIDMap are reported structurally, not fully interpreted."
        )
    else:
        encoding = font.get("/Encoding")
        result["encoding"] = {
            "name": _name(encoding) if not hasattr(dereference(encoding), "get") else "dictionary",
            **_differences_summary(encoding),
        }
        result["simple_widths"] = _simple_width_summary(font)
        descriptor = dereference(font.get("/FontDescriptor"))
        result["font_program_keys"] = _font_program_keys(descriptor)
        result["font_program_embedded"] = bool(result["font_program_keys"])

    return result
