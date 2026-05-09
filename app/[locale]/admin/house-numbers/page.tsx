import { listHouseNumberCandidates } from "@/lib/adminHouseNumbers";
import { getDb } from "@/lib/db";
import CorrectionTable from "./CorrectionTable";

export const dynamic = "force-dynamic";

export default function HouseNumbersPage() {
  const db = getDb();
  const candidates = listHouseNumberCandidates(db);

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
