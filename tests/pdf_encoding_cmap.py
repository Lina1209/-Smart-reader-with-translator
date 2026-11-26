"""Read-only parser for PDF Encoding CMap codespaces and CID mappings.

Supports codespacerange, cidchar and cidrange sections. It does not resolve
predefined CMaps, font glyph IDs, embedded font programs, or perform rewriting.
"""
import re


_TOKEN = re.compile(rb"<([0-9A-Fa-f\s]*)>|(-?\d+)|([^\s]+)")


def _tokens(data):
    data = re.sub(rb"%[^\r\n]*", b"", data)
    output = []
    for match in _TOKEN.finditer(data):
        if match.group(1) is not None:
            compact = re.sub(rb"\s+", b"", match.group(1))
            if len(compact) % 2:
                compact += b"0"
            try:
                output.append(("hex", bytes.fromhex(compact.decode("ascii"))))
            except ValueError:
                output.append(("invalid-hex", compact))
        elif match.group(2) is not None:
            output.append(("int", int(match.group(2))))
        else:
            output.append(("word", match.group(3)))
    return output


def parse_encoding_cmap(data, max_mappings=100000, max_range=4096):
    if not isinstance(data, (bytes, bytearray)):
        return {"status": "invalid-input", "codespaces": [], "mappings": {}, "errors": ["CMap must be bytes"]}
    raw = bytes(data)
    codespaces = []
    mappings = {}
    errors = []
    sections = 0

    def source_bounds(first, last):
        if not first or len(first) > 4 or len(first) != len(last):
            raise ValueError("source codes must have equal lengths from 1 to 4 bytes")
        start = int.from_bytes(first, "big")
        end = int.from_bytes(last, "big")
        if end < start:
            raise ValueError("source range end precedes start")
        return start, end, len(first)

    def add(source, cid):
        key = source.hex().upper()
        if key in mappings:
            raise ValueError("duplicate source code mapping")
        if len(mappings) >= max_mappings:
            raise ValueError("mapping limit exceeded")
        if cid < 0 or cid > 0x7FFFFFFF:
            raise ValueError("CID outside supported non-negative range")
        mappings[key] = cid

    for match in re.finditer(rb"\bbegincodespacerange\b(.*?)\bendcodespacerange\b", raw, re.S):
        sections += 1
        tokens = _tokens(match.group(1))
        try:
            if len(tokens) % 2:
                raise ValueError("codespace range has unmatched token")
            for i in range(0, len(tokens), 2):
                first, last = tokens[i:i + 2]
                if first[0] != "hex" or last[0] != "hex":
                    raise ValueError("codespace bounds must be hex strings")
                start, end, length = source_bounds(first[1], last[1])
                codespaces.append({"byte_length": length, "start": start, "end": end})
        except ValueError as exc:
            errors.append("codespacerange: " + str(exc))

    for match in re.finditer(rb"\bbegincidchar\b(.*?)\bendcidchar\b", raw, re.S):
        sections += 1
        tokens = _tokens(match.group(1))
        try:
            if len(tokens) % 2:
                raise ValueError("cidchar section has unmatched token")
            for i in range(0, len(tokens), 2):
                source, cid = tokens[i:i + 2]
                if source[0] != "hex" or cid[0] != "int":
                    raise ValueError("cidchar entries must be hex source and integer CID")
                add(source[1], cid[1])
        except ValueError as exc:
            errors.append("cidchar: " + str(exc))

    for match in re.finditer(rb"\bbegincidrange\b(.*?)\bendcidrange\b", raw, re.S):
        sections += 1
        tokens = _tokens(match.group(1))
        try:
            if len(tokens) % 3:
                raise ValueError("cidrange section has incomplete entry")
            for i in range(0, len(tokens), 3):
                first, last, cid = tokens[i:i + 3]
                if first[0] != "hex" or last[0] != "hex" or cid[0] != "int":
                    raise ValueError("cidrange requires hex bounds and integer starting CID")
                start, end, length = source_bounds(first[1], last[1])
                count = end - start + 1
                if count > max_range or len(mappings) + count > max_mappings:
                    raise ValueError("cidrange expansion limit exceeded")
                for offset in range(count):
                    add((start + offset).to_bytes(length, "big"), cid[1] + offset)
        except ValueError as exc:
            errors.append("cidrange: " + str(exc))
            break

    if not sections:
        errors.append("no supported codespacerange, cidchar or cidrange sections found")
    for key in mappings:
        code = bytes.fromhex(key)
        if codespaces and not any(
            space["byte_length"] == len(code)
            and space["start"] <= int.from_bytes(code, "big") <= space["end"]
            for space in codespaces
        ):
            errors.append("mapped source code falls outside declared codespaces: " + key)
            break

    return {
        "status": "malformed" if errors else "parsed",
        "codespaces": codespaces,
        "mappings": mappings,
        "mapping_count": len(mappings),
        "errors": errors,
        "limitations": [
            "Only embedded CMap codespacerange, cidchar and cidrange operators are parsed.",
            "Predefined named CMaps and UseCMap inheritance are not resolved.",
            "CID values are not glyph IDs; CIDToGIDMap and font outlines are not resolved.",
            "This is diagnostic only and does not rewrite PDF content.",
        ],
    }
