"""Join PDF Type 0 source-code, Unicode, CID and GID evidence read-only."""

from pdf_font_resource_audit import lookup_cid_to_gid


def resolve_type0_character_code(
    source_code_hex,
    encoding_report,
    tounicode_report,
    cid_to_gid_map=None,
    descendant_subtype="/CIDFontType2",
):
    if not isinstance(source_code_hex, str):
        return {"status": "invalid-source-code"}
    code = source_code_hex.upper()
    if len(code) < 2 or len(code) > 8 or len(code) % 2:
        return {"status": "invalid-source-code"}
    try:
        bytes.fromhex(code)
    except ValueError:
        return {"status": "invalid-source-code"}

    cid = (encoding_report or {}).get("mappings", {}).get(code)
    unicode_text = (tounicode_report or {}).get("mappings", {}).get(code)
    result = {
        "source_code": code,
        "unicode": unicode_text,
        "cid": cid,
        "gid": None,
        "status": "incomplete",
        "evidence": {
            "encoding_cmap": (encoding_report or {}).get("status"),
            "tounicode_cmap": (tounicode_report or {}).get("status"),
        },
        "limitations": [
            "This joins supplied diagnostic reports; it does not parse a PDF font object itself.",
            "ToUnicode and Encoding CMaps are independent maps and are joined only by identical source-code bytes.",
            "A CID is not a GID; CIDToGIDMap applies only to CIDFontType2.",
            "A resolved GID does not prove an outline exists or that translated text can be shaped and encoded.",
        ],
    }
    if cid is None:
        result["status"] = "missing-cid-mapping"
        return result
    if unicode_text is None:
        result["status"] = "missing-unicode-mapping"
        return result

    gid_result = lookup_cid_to_gid(cid_to_gid_map, cid, descendant_subtype)
    result["gid"] = gid_result.get("gid")
    result["evidence"]["cid_to_gid"] = gid_result
    if gid_result["status"] in ("explicit", "identity", "identity-default"):
        result["status"] = "mapped"
    else:
        result["status"] = "cid-to-gid-" + gid_result["status"]
    return result
