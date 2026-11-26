"""Conservative audit of parsed PDF content-stream operators.

This reports operator/state evidence only. It does not rewrite streams, resolve
font encodings, calculate glyph advances, or prove clipping geometry.
"""
from copy import deepcopy


TEXT_STATE_DEFAULTS = {
    "font": None, "font_size": None, "char_spacing": 0.0,
    "word_spacing": 0.0, "horizontal_scale": 100.0,
    "leading": 0.0, "rise": 0.0, "render_mode": 0,
}
TEXT_SHOW_OPS = {b"Tj", b"TJ", b"'", b'"'}


def audit_content_operations(operations):
    state = deepcopy(TEXT_STATE_DEFAULTS)
    stack = []
    events = []
    in_text = False
    pending_clip = False
    clip_operator_count = 0
    form_invocations = 0
    matrix_changes = 0
    unknown = []

    for index, (operands, operator) in enumerate(operations):
        if operator == b"q":
            stack.append(deepcopy(state))
        elif operator == b"Q":
            if stack:
                state = stack.pop()
            else:
                unknown.append({"index": index, "reason": "unmatched-Q"})
        elif operator == b"BT":
            in_text = True
        elif operator == b"ET":
            in_text = False
        elif operator == b"Tf" and len(operands) >= 2:
            state["font"] = str(operands[0])
            state["font_size"] = float(operands[1])
        elif operator == b"Tc" and operands:
            state["char_spacing"] = float(operands[0])
        elif operator == b"Tw" and operands:
            state["word_spacing"] = float(operands[0])
        elif operator == b"Tz" and operands:
            state["horizontal_scale"] = float(operands[0])
        elif operator == b"TL" and operands:
            state["leading"] = float(operands[0])
        elif operator == b"Ts" and operands:
            state["rise"] = float(operands[0])
        elif operator == b"Tr" and operands:
            state["render_mode"] = int(operands[0])
        elif operator in (b"Tm", b"Td", b"TD", b"T*"):
            # Preserve raw operands; exact resulting text matrix needs full
            # text-matrix and glyph-advance interpretation.
            matrix_changes += 1
        elif operator in TEXT_SHOW_OPS:
            events.append({
                "index": index,
                "operator": operator.decode("ascii"),
                "operands": [str(value) for value in operands],
                "text_state": deepcopy(state),
                "inside_text_object": in_text,
                "text_matrix_after_show": "not-computed",
            })
        elif operator in (b"W", b"W*"):
            pending_clip = True
            clip_operator_count += 1
        elif operator == b"n" and pending_clip:
            pending_clip = False
        elif operator == b"cm":
            matrix_changes += 1
        elif operator == b"Do":
            form_invocations += 1

    return {
        "events": events,
        "unclosed_text_object": in_text,
        "unmatched_graphics_saves": len(stack),
        "pending_clip_at_end": pending_clip,
        "clip_operator_count": clip_operator_count,
        "form_invocations": form_invocations,
        "matrix_operator_count": matrix_changes,
        "unknown": unknown,
        "limitations": [
            "Font resources and CMaps are not resolved by this audit.",
            "Tj/TJ glyph advances and resulting text matrices are not calculated.",
            "Clipping paths, transparency groups and nested Form resources are not resolved.",
            "This is a diagnostic report, not a PDF rewrite engine.",
        ],
    }
