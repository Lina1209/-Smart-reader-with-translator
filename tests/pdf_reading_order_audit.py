"""Heuristic PDF text grouping and reading-order diagnostic. No rewriting."""
import math

def _box(item):
    try:
        x,y,w,h=map(float,(item["x"],item["y"],item["width"],item["height"]))
        if not all(math.isfinite(v) for v in (x,y,w,h)) or w<=0 or h<=0: return None
        return (x,y,x+w,y+h)
    except (KeyError,TypeError,ValueError): return None

def _overlap(a,b):
    ix=max(0,min(a[2],b[2])-max(a[0],b[0]))
    iy=max(0,min(a[3],b[3])-max(a[1],b[1]))
    return ix*iy

def audit_reading_order(items, regions=None, row_tolerance=3.0, column_gap=12.0):
    """Items are caller-normalized page coordinates with explicit sequence indices.
    Regions may be named rectangles (e.g. table cells or column bounds).
    """
    regions=regions or []
    valid=[]; unknown=[]
    for i,it in enumerate(items or []):
        b=_box(it)
        if b is None: unknown.append({"item_index":i,"reason":"invalid-geometry"}); continue
        area=(b[2]-b[0])*(b[3]-b[1])
        region_hits=[]
        for r in regions:
            try:
                rb=tuple(map(float,r["bbox"]))
                if len(rb)==4 and _overlap(b,rb)/area >= float(r.get("min_overlap",0.5)):
                    region_hits.append(r.get("id",r.get("type","region")))
            except (KeyError,TypeError,ValueError): continue
        valid.append({"item_index":i,"sequence":float(it.get("sequence",i)) if isinstance(it.get("sequence",i),(int,float)) and math.isfinite(float(it.get("sequence",i))) else i,"sequence_explicit":"sequence" in it and isinstance(it.get("sequence"),(int,float)) and math.isfinite(float(it.get("sequence"))),"text":it.get("text",""),
          "bbox":b,"center_x":(b[0]+b[2])/2,"center_y":(b[1]+b[3])/2,
          "region_ids":region_hits})
    # Group by vertical bands, preserving ambiguous items as separate bands.
    ordered=sorted(valid,key=lambda z:(-z["center_y"],z["center_x"],z["sequence"]))
    rows=[]
    for item in ordered:
        if not rows or abs(rows[-1]["center_y"]-item["center_y"])>row_tolerance:
            rows.append({"center_y":item["center_y"],"items":[]})
        rows[-1]["items"].append(item)
        rows[-1]["center_y"]=sum(x["center_y"] for x in rows[-1]["items"])/len(rows[-1]["items"])
    for row in rows:
        row["items"].sort(key=lambda z:(z["center_x"],z["sequence"]))
    # Columns are coarse x-clusters; this is only a hint, not layout truth.
    columns=[]
    for item in sorted(valid,key=lambda z:z["center_x"]):
        if not columns or item["center_x"]-columns[-1]["center_x"]>column_gap:
            columns.append({"center_x":item["center_x"],"items":[]})
        columns[-1]["items"].append(item)
        columns[-1]["center_x"]=sum(x["center_x"] for x in columns[-1]["items"])/len(columns[-1]["items"])
    # Detect source sequence moving from a right column back to a left column
    # within a similar vertical band, indicating likely column interleaving.
    anomalies=[]
    sequenced=sorted((x for x in valid if x["sequence_explicit"]),key=lambda z:z["sequence"])
    for a,b in zip(sequenced,sequenced[1:]):
        if a["center_x"]>b["center_x"]+column_gap and abs(a["center_y"]-b["center_y"])<=row_tolerance*2:
            anomalies.append({"from_item":a["item_index"],"to_item":b["item_index"],"reason":"possible-right-to-left-sequence-jump"})
    return {"status":"incomplete" if unknown else ("review" if anomalies else "ok"),
      "items":valid,"rows":[{"center_y":r["center_y"],"item_indices":[x["item_index"] for x in r["items"]]} for r in rows],
      "columns":[{"center_x":c["center_x"],"item_indices":[x["item_index"] for x in c["items"]]} for c in columns],
      "sequence_anomalies":anomalies,"unknown":unknown,
      "limitations":["Coordinates must share one page coordinate space and orientation.",
       "Row/column clustering is heuristic and may fail for mixed layouts, RTL, rotated text, tables, captions, footnotes, or variable baselines.",
       "Regions are caller-supplied rectangles; this does not detect table structure or infer semantic reading order.",
       "Diagnostic only; not connected to translation or PDF editing."]}
