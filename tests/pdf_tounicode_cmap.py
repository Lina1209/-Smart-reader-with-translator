"""Conservative read-only parser for PDF ToUnicode bfchar/bfrange mappings.

This parser is diagnostic only. It does not decode source encodings, Encoding
CMaps, CIDs, glyph IDs, font subsets, or perform PDF text replacement.
"""
import re


_TOKEN = re.compile(rb"<([0-9A-Fa-f\s]*)>|(\[|\])|(-?\d+)|([^\s]+)")


def _tokens(data):
    data = re.sub(rb"%[^\r\n]*", b"", data)
    result = []
    for match in _TOKEN.finditer(data):
        if match.group(1) is not None:
            compact = re.sub(rb"\s+", b"", match.group(1))
            if len(compact) % 2:
                compact += b"0"
            try:
                result.append(("hex", bytes.fromhex(compact.decode("ascii"))))
            except ValueError:
                result.append(("invalid-hex", compact))
        elif match.group(2) is not None:
            result.append((match.group(2).decode("ascii"), None))
        elif match.group(3) is not None:
            result.append(("int", int(match.group(3))))
        else:
            result.append(("word", match.group(4)))
    return result


def _source_key(value):
    if not value or len(value) > 4:
        raise ValueError("source character code must contain 1 to 4 bytes")
    return value.hex().upper()


def _unicode_value(value):
    if len(value) % 2:
        raise ValueError("ToUnicode destination must contain UTF-16BE code units")
    return value.decode("utf-16-be", errors="strict")


def parse_tounicode_cmap(data, max_mappings=100000, max_range=4096):
    """Parse bfchar and both scalar/array bfrange forms; fail closed on errors."""
    if not isinstance(data, (bytes, bytearray)):
        return {"status": "invalid-input", "mapping_count": 0, "mappings": {}, "errors": ["CMap must be bytes"]}
    raw = bytes(data)
    mappings = {}
    errors = []
    sections = 0

    def add(source, destination):
        key = _source_key(source)
        value = _unicode_value(destination)
        if key in mappings:
            raise ValueError("duplicate source code mapping")
        if len(mappings) >= max_mappings:
            raise ValueError("mapping limit exceeded")
        mappings[key] = value

    for match in re.finditer(rb"\bbeginbfchar\b(.*?)\bendbfchar\b", raw, re.S):
        sections += 1
        tokens = _tokens(match.group(1))
        try:
            if len(tokens) % 2:
                raise ValueError("bfchar section has an unmatched token")
            for index in range(0, len(tokens), 2):
                source, destination = tokens[index:index + 2]
                if source[0] != "hex" or destination[0] != "hex":
                    raise ValueError("bfchar entries must be source/destination hex strings")
                add(source[1], destination[1])
        except (ValueError, UnicodeError) as exc:
            errors.append("bfchar: " + str(exc))

    for match in re.finditer(rb"\bbeginbfrange\b(.*?)\bendbfrange\b", raw, re.S):
        sections += 1
        tokens = _tokens(match.group(1))
        index = 0
        try:
            while index < len(tokens):
                if index + 2 >= len(tokens):
                    raise ValueError("bfrange entry is incomplete")
                first, last, destination = tokens[index:index + 3]
                if first[0] != "hex" or last[0] != "hex" or len(first[1]) != len(last[1]):
                    raise ValueError("bfrange source bounds must be equal-length hex strings")
                start = int.from_bytes(first[1], "big")
                end = int.from_bytes(last[1], "big")
                if end < start:
                    raise ValueError("bfrange end precedes start")
                count = end - start + 1
                if count > max_range or len(mappings) + count > max_mappings:
                    raise ValueError("bfrange expansion limit exceeded")
                source_length = len(first[1])
                if destination[0] == "hex":
                    base = int.from_bytes(destination[1], "big")
                    byte_length = len(destination[1])
                    if byte_length == 0:
                        raise ValueError("bfrange destination is empty")
                    for offset in range(count):
                        target = (base + offset).to_bytes(byte_length, "big")
                        add((start + offset).to_bytes(source_length, "big"), target)
                    index += 3
                elif destination[0] == "[":
                    cursor = index + 3
                    values = []
                    while cursor < len(tokens) and tokens[cursor][0] != "]":
                        if tokens[cursor][0] != "hex":
                            raise ValueError("bfrange destination array must contain hex strings")
                        values.append(tokens[cursor][1])
                        cursor += 1
                    if cursor >= len(tokens) or len(values) != count:
                        raise ValueError("bfrange destination array length does not match source range")
                    for offset, target in enumerate(values):
                        add((start + offset).to_bytes(source_length, "big"), target)
                    index = cursor + 1
                else:
                    raise ValueError("bfrange destination must be a hex string or array")
        except (ValueError, UnicodeError, OverflowError) as exc:
            errors.append("bfrange: " + str(exc))
            break

    if not sections:
        errors.append("no supported bfchar or bfrange sections found")
    return {
        "status": "malformed" if errors else "parsed",
        "mapping_count": len(mappings),
        "mappings": mappings,
        "errors": errors,
        "limitations": [
            "Only ToUnicode bfchar and bfrange mappings are parsed.",
            "Codespace ranges, source Encoding CMaps, CIDs, glyph IDs and font encodings are not resolved.",
            "A ToUnicode map supports extraction; it is not a reverse encoder for replacement text.",
        ],
    }
