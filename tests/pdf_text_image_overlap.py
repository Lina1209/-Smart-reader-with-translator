"""Join PDF.js text geometry with recursive image-placement diagnostics.

Inputs must already share page-user-space coordinates. This diagnostic is
conservative and does not determine actual occlusion, clipping, or rewriting.
"""
import math


def text_geometry_polygon(fragment):
    try:
        baseline = fragment["baseline"]
        basis_x = fragment["basis"]["x"]
        basis_y = fragment["basis"]["y"]
        advance = float(fragment["advance"])
        height = float(fragment["height"])
        values = [baseline["x"], baseline["y"], basis_x["x"], basis_x["y"],
                  basis_y["x"], basis_y["y"], advance, height]
        if not all(math.isfinite(float(v)) for v in values) or advance <= 0 or height <= 0:
            return None
        ux, uy = basis_x["x"], basis_x["y"]
        vx, vy = basis_y["x"], basis_y["y"]
        ux_len, vy_len = math.hypot(ux, uy), math.hypot(vx, vy)
        if ux_len <= 1e-9 or vy_len <= 1e-9:
            return None
        # PDF.js text-item dimensions are converted to page-space lengths.
        # Build a parallelogram, retaining rotation/skew rather than flattening.
        x0, y0 = baseline["x"], baseline["y"]
        x1, y1 = x0 + ux / ux_len * advance, y0 + uy / ux_len * advance
        x2, y2 = x1 + vx / vy_len * height, y1 + vy / vy_len * height
        x3, y3 = x0 + vx / vy_len * height, y0 + vy / vy_len * height
        return [(x0, y0), (x1, y1), (x2, y2), (x3, y3)]
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def _area(poly):
    if len(poly) < 3:
        return 0.0
    return abs(sum(poly[i][0] * poly[(i+1)%len(poly)][1] -
                   poly[(i+1)%len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2.0


def _clip(subject, clipper, eps=1e-9):
    if len(subject) < 3 or len(clipper) < 3:
        return []
    signed = sum(clipper[i][0]*clipper[(i+1)%len(clipper)][1] -
                 clipper[(i+1)%len(clipper)][0]*clipper[i][1]
                 for i in range(len(clipper)))
    if abs(signed) < eps:
        return []
    sign = 1 if signed > 0 else -1
    def side(p,a,b):
        return sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))
    out=list(subject)
    for i,a in enumerate(clipper):
        b=clipper[(i+1)%len(clipper)]
        src,out=out,[]
        if not src: break
        prev=src[-1]; pin=side(prev,a,b)>=-eps
        for cur in src:
            cin=side(cur,a,b)>=-eps
            if cin != pin:
                dx,dy=cur[0]-prev[0],cur[1]-prev[1]
                ex,ey=b[0]-a[0],b[1]-a[1]
                den=dx*ey-dy*ex
                if abs(den)>eps:
                    t=((a[0]-prev[0])*ey-(a[1]-prev[1])*ex)/den
                    out.append((prev[0]+t*dx,prev[1]+t*dy))
            if cin: out.append(cur)
            prev,pin=cur,cin
    return out if _area(out)>eps else []


def compare_text_fragments_to_images(text_fragments, image_report):
    placements=image_report.get("placements",[]) if isinstance(image_report,dict) else []
    unknown=list(image_report.get("unknown",[])) if isinstance(image_report,dict) else [{"reason":"image-report-invalid"}]
    findings=[]
    for i,fragment in enumerate(text_fragments or []):
        text_poly=text_geometry_polygon(fragment)
        if text_poly is None:
            unknown.append({"text_fragment_index":i,"reason":"invalid-text-geometry"})
            continue
        for j,image in enumerate(placements):
            image_poly=(image.get("form_clip_intersection_corners") if "form_clip_intersection_corners" in image else image.get("transformed_corners"))
            if image.get("fully_clipped_by_form_bboxes") is True:
                image_poly = []\n            if not isinstance(image_poly,list) or len(image_poly)<3:\n                if image.get("fully_clipped_by_form_bboxes") is True:\n                    continue
                unknown.append({"text_fragment_index":i,"image_index":j,"reason":"image-polygon-unavailable"})
                continue
            overlap=_clip(text_poly,image_poly)
            area=_area(overlap)
            if area>1e-8:
                findings.append({"text_fragment_index":i,"image_index":j,
                    "overlap_area":area,"intersection_corners":overlap,
                    "image_bbox":image.get("bbox"),"text":fragment.get("text","")})
            if image.get("arbitrary_clip_unresolved"):
                unknown.append({"text_fragment_index":i,"image_index":j,
                    "reason":"image-arbitrary-clipping-unresolved"})
    return {"status":"overlap" if findings else ("incomplete" if unknown else "clear"),
            "overlaps":findings,"unknown":unknown,
            "limitations":["Input text/image geometry must be in the same page coordinate space.",
                "PDF text geometry is a conservative item parallelogram, not exact glyph outlines.",
                "Image placement intersection does not prove pixel occlusion or visual obstruction.",
                "Arbitrary clips, transparency, z-order and blend modes are not resolved.",
                "This diagnostic is not connected to translation/rewrite and makes no edits."]}
