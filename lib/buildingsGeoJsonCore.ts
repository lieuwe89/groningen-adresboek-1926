export type BuildingRow = {
  pand_id: string;
  geometry: string;
  entry_count: number;
  address_count: number;
};

function parseGeometry(row: BuildingRow): unknown {
  try {
    return JSON.parse(row.geometry);
  } catch (err) {
    throw new Error(`Invalid building geometry JSON for ${row.pand_id}`, {
      cause: err,
    });
  }
}

export function serializeBuildingRows(rows: BuildingRow[]): string {
  return JSON.stringify({
    type: "FeatureCollection" as const,
    features: rows.map((row) => ({
      type: "Feature" as const,
      geometry: parseGeometry(row),
      properties: {
        pand_id: row.pand_id,
        entry_count: row.entry_count,
        address_count: row.address_count,
      },
    })),
  });
}
