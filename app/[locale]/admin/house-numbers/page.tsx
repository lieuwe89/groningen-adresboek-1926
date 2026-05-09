import { getDb } from "@/lib/db";
import CorrectionTable, { type Candidate } from "./CorrectionTable";

export default function HouseNumbersPage() {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT e.stable_id, e.name, e.address_street, e.address_number, e.address_full, e.entry_bbox, p.page_number
    FROM entries e
    JOIN pages p ON e.page_id = p.id
    WHERE e.pand_id IS NULL
      AND length(e.address_number) > 2
      AND e.address_number GLOB '*[0-9]*'
      AND e.address_number NOT GLOB '*[^0-9]*'
      AND e.entry_bbox IS NOT NULL
    ORDER BY e.address_street, e.address_number
    LIMIT 25
  `).all() as Candidate[];

  return (
    <main className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold mb-2">House Number Correction</h1>
        <p className="text-gray-600 mb-8">
          Found {candidates.length} (showing first 25) unlinked house numbers &gt; 2 digits that are purely numeric.
          These are likely OCR errors where a suffix (e.g. 52¹) was misread as a digit (e.g. 521).
          Type the correction and press Enter to save.
        </p>

        <CorrectionTable candidates={candidates} />
      </div>
    </main>
  );
}
