"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type StyleSpecification, type FilterSpecification } from "maplibre-gl";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";
import "maplibre-gl/dist/maplibre-gl.css";

import { HISTORIC_MAPS } from "@/lib/historicMaps";
import { resolvePublicAssetUrl } from "@/lib/publicAssetUrls";

const GRONINGEN_CENTER: [number, number] = [6.5665, 53.2194];
const MAP_POS_KEY = "grn1926-map-pos";

// Keep only footprints whose BAG bouwjaar is <= 1926. `to-number` with a high
// fallback drops features with missing/null bouwjaar (they sort above 1926).
const ONLY_1926_FILTER: FilterSpecification = [
  "<=",
  ["to-number", ["get", "bouwjaar"], 99999],
  1926,
];

// Register the cog:// protocol exactly once per JS module load. Calling
// addProtocol twice for the same scheme throws in maplibre-gl, which would
// crash the second mount under React StrictMode and HMR.
let _cogProtocolRegistered = false;
function ensureCogProtocol() {
  if (_cogProtocolRegistered) return;
  try {
    maplibregl.addProtocol("cog", cogProtocol);
    _cogProtocolRegistered = true;
  } catch {
    // already registered in another module instance — fine.
    _cogProtocolRegistered = true;
  }
}

interface Props {
  buildingsVisible: boolean;
  only1926: boolean; // when true, show only buildings with bouwjaar <= 1926
  historicId: string | null; // id from HISTORIC_MAPS, or null = no overlay
  historicOpacity: number; // 0..1
  onBuildingClick: (pand_id: string) => void;
  focusPandId?: string | null;
}

export default function MapView({
  buildingsVisible,
  only1926,
  historicId,
  historicOpacity,
  onBuildingClick,
  focusPandId,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  // Hover highlight: track hovered pand id via feature-state.
  const hoveredRef = useRef<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const buildingsDataRef = useRef<any>(null);

  // Initial map setup runs once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Register the cog:// protocol once per module load.
    ensureCogProtocol();

    const style: StyleSpecification = {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        carto: {
          type: "raster",
          tiles: ["https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        },
      },
      layers: [{ id: "carto-base", type: "raster", source: "carto" }],
    };

    const savedPos = (() => {
      try {
        const raw = sessionStorage.getItem(MAP_POS_KEY);
        return raw ? (JSON.parse(raw) as { center: [number, number]; zoom: number }) : null;
      } catch { return null; }
    })();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      center: savedPos?.center ?? GRONINGEN_CENTER,
      zoom: savedPos?.zoom ?? 13,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    map.on("moveend", () => {
      const c = map.getCenter();
      try {
        sessionStorage.setItem(MAP_POS_KEY, JSON.stringify({ center: [c.lng, c.lat], zoom: map.getZoom() }));
      } catch { /* quota exceeded or private browsing — silently ignore */ }
    });

    map.on("load", async () => {
      // Buildings: GeoJSON with a `pand_id` and `entry_count` per feature.
      const res = await fetch("/api/buildings");
      const data = await res.json();
      buildingsDataRef.current = data;
      map.addSource("buildings", { type: "geojson", data, promoteId: "pand_id" });

      // Subtle amber outline so the user knows which footprints are clickable.
      map.addLayer({
        id: "buildings-line",
        type: "line",
        source: "buildings",
        paint: {
          "line-color": "#e8b84c",
          "line-width": [
            "case",
            ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "focus"], false]],
            2.0,
            0.6,
          ],
          "line-opacity": [
            "case",
            ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "focus"], false]],
            1.0,
            0.55,
          ],
        },
      });

      // Tinted fill for has-records buildings, plus invisible-but-clickable
      // fill on top so the click target is the full polygon.
      map.addLayer({
        id: "buildings-fill",
        type: "fill",
        source: "buildings",
        paint: {
          "fill-color": "#e8b84c",
          "fill-opacity": [
            "case",
            ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "focus"], false]],
            0.32,
            0.14,
          ],
        },
      });

      // Click → ask parent to open BuildingPanel.
      map.on("click", "buildings-fill", (e) => {
        const f = e.features?.[0];
        const pid = f?.properties?.pand_id;
        if (typeof pid === "string") onBuildingClick(pid);
      });

      // Hover state.
      map.on("mousemove", "buildings-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        const pid = f?.properties?.pand_id;
        if (typeof pid !== "string") return;
        if (hoveredRef.current && hoveredRef.current !== pid) {
          map.setFeatureState(
            { source: "buildings", id: hoveredRef.current },
            { hover: false },
          );
        }
        hoveredRef.current = pid;
        map.setFeatureState({ source: "buildings", id: pid }, { hover: true });
      });
      map.on("mouseleave", "buildings-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoveredRef.current) {
          map.setFeatureState(
            { source: "buildings", id: hoveredRef.current },
            { hover: false },
          );
          hoveredRef.current = null;
        }
      });

      setReady(true);
    });

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Respond to focusPandId changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (focusedRef.current) {
      map.setFeatureState(
        { source: "buildings", id: focusedRef.current },
        { focus: false },
      );
    }
    focusedRef.current = focusPandId ?? null;
    if (focusPandId) {
      map.setFeatureState(
        { source: "buildings", id: focusPandId },
        { focus: true },
      );

      const feat = buildingsDataRef.current?.features.find(
        (f: any) => f.properties.pand_id === focusPandId
      );
      if (feat) {
        const bounds = new maplibregl.LngLatBounds();
        const geom = feat.geometry;
        if (geom.type === "Polygon") {
          geom.coordinates[0].forEach((c: any) => bounds.extend(c));
        } else if (geom.type === "MultiPolygon") {
          geom.coordinates.forEach((poly: any) =>
            poly[0].forEach((c: any) => bounds.extend(c))
          );
        }
        map.fitBounds(bounds, { padding: 100, maxZoom: 19, duration: 1000 });
      }
    }
  }, [focusPandId, ready]);

  // Respond to building visibility toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const v = buildingsVisible ? "visible" : "none";
    for (const id of ["buildings-fill", "buildings-line"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }, [buildingsVisible, ready]);

  // Apply / clear the "only buildings ≤ 1926" filter on both building layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const filter = only1926 ? ONLY_1926_FILTER : null;
    for (const id of ["buildings-fill", "buildings-line"]) {
      if (map.getLayer(id)) map.setFilter(id, filter);
    }
  }, [only1926, ready]);

  // Swap historic layer when selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    // Remove any previously added historic source/layer.
    for (const m of HISTORIC_MAPS) {
      const layerId = `historic-${m.id}`;
      const sourceId = `historic-${m.id}-src`;
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    }

    if (!historicId) return;
    const conf = HISTORIC_MAPS.find((m) => m.id === historicId);
    if (!conf) return;

    const sourceId = `historic-${conf.id}-src`;
    const layerId = `historic-${conf.id}`;

    const assetUrl = resolvePublicAssetUrl({
      assetPath: conf.url,
      cdnBaseUrl:
        process.env.NEXT_PUBLIC_MAPS_BASE_URL ||
        process.env.NEXT_PUBLIC_STATIC_ASSETS_BASE_URL,
    });
    const fullUrl = new URL(assetUrl, window.location.origin).href;

    map.addSource(sourceId, {
      type: "raster",
      // Using tiles array with {z}/{x}/{y} is often more reliable for custom protocols.
      // Reverting to 256 as the geomatico protocol handler is hardcoded to this size.
      tiles: [`cog://${fullUrl}/{z}/{x}/{y}`],
      tileSize: 256,
      bounds: conf.bbox,
    });

    // Insert under buildings-line so building outlines stay on top.
    // Fallback to undefined (top of stack) if buildings-line isn't ready.
    const beforeId = map.getLayer("buildings-line") ? "buildings-line" : undefined;
    map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": historicOpacity },
      },
      beforeId
    );
  }, [historicId, ready]);

  // Update opacity without re-adding the layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !historicId) return;
    const layerId = `historic-${historicId}`;
    if (map.getLayer(layerId)) {
      map.setPaintProperty(layerId, "raster-opacity", historicOpacity);
    }
  }, [historicOpacity, historicId, ready]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
