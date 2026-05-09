import path from "path";

export function getJsonDir() {
  return process.env.JSON_DIR ?? path.resolve(process.cwd(), "_pipeline", "output", "json");
}

export function getOverridesDir() {
  return process.env.OVERRIDES_DIR ?? path.resolve(process.cwd(), "data", "overrides");
}
