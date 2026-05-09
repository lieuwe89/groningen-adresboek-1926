import {
  updateOverride,
  type EntryId,
  type EntryOverride,
} from "@/lib/overrides";

type OverrideSaveResult = {
  override: EntryOverride;
  warning?: string;
};

export async function saveOverrideBestEffort(
  stem: string,
  id: EntryId,
  fallback: EntryOverride,
  update: (previous: EntryOverride | undefined) => EntryOverride
): Promise<OverrideSaveResult> {
  try {
    return { override: await updateOverride(stem, id, update) };
  } catch (err) {
    return {
      override: fallback,
      warning: `Override file was not written: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}
