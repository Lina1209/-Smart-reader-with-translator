import unittest
from pdf_reading_order_audit import audit_reading_order

def item(text,x,y,w=30,h=10,seq=None):
 d={"text":text,"x":x,"y":y,"width":w,"height":h}
 if seq is not None:d["sequence"]=seq
 return d

class ReadingOrderAuditTests(unittest.TestCase):
 def test_row_grouping_and_left_to_right(self):
  r=audit_reading_order([item("B",50,90),item("A",10,91),item("C",10,60)])
  self.assertEqual(r["rows"][0]["item_indices"],[1,0])
  self.assertEqual(r["status"],"ok")
 def test_right_to_left_sequence_jump_flagged(self):
  r=audit_reading_order([item("right",150,90,seq=1),item("left",20,89,seq=2)])
  self.assertEqual(r["status"],"review")
  self.assertEqual(r["sequence_anomalies"][0]["reason"],"possible-right-to-left-sequence-jump")
 def test_region_tagged(self):
  r=audit_reading_order([item("cell",20,20)],regions=[{"id":"table-cell-1","bbox":[0,0,60,40]}])
  self.assertEqual(r["items"][0]["region_ids"],["table-cell-1"])
 def test_invalid_item_is_incomplete(self):
  r=audit_reading_order([{"text":"bad","x":0,"y":0,"width":0,"height":4}])
  self.assertEqual(r["status"],"incomplete")
  self.assertEqual(r["unknown"][0]["reason"],"invalid-geometry")
 def test_vertical_separation_forms_rows(self):
  r=audit_reading_order([item("top",0,100),item("bottom",0,20)])
  self.assertEqual(len(r["rows"]),2)
if __name__=="__main__": unittest.main()
