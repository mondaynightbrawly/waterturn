import { it, expect } from "vitest";
import Papa from "papaparse";
import { attachmentName, csvRows } from "./advanced";
it("downloads attachment names with a safe extension matching the allowed content type", () => {
  expect(attachmentName("../unsafe.html", "text/plain")).toBe("unsafe.txt");
  expect(attachmentName("fictional-observation.txt", "text/plain")).toBe(
    "fictional-observation.txt",
  );
  expect(attachmentName("field-photo.jpeg", "image/jpeg")).toBe(
    "field-photo.jpg",
  );
});

it("CSV exports parse back into rows, quote multiline values and mitigate leading-whitespace formulas", () => {
  const rows = [
    ["Name", "Notes"],
    ["\t=1+1", 'First line\nSecond "quoted" line'],
  ];
  const exported = csvRows(rows);
  expect(exported).toContain("\r\n");
  expect(Papa.parse<string[]>(exported).data).toEqual([
    rows[0],
    ["'\t=1+1", rows[1][1]],
  ]);
});
