"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type StyleSpecification } from "maplibre-gl";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";
import "maplibre-gl/dist/maplibre-gl.css";

import { HISTORIC_MAPS } from "@/lib/historicMaps";

const GRONINGEN_CENTER: [number, number] = [6.5665, 53.2194];
const MAP_POS_KEY = "grn1926-map-pos";

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
  historicId: string | null; // id from HISTORIC_MAPS, or null = no overlay
  historicOpacity: number; // 0..1
  onBuildingClick: (pand_id: string) => void;
}

export default function MapView({
  buildingsVisible,
  historicId,
  historicOpacity,
  onBuildingClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);

  // Hover highlight: track hovered pand id via feature-state.
  const hoveredRef = useRef<string | null>(null);

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
            ["boolean", ["feature-state", "hover"], false],
            2.0,
            0.6,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
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
            ["boolean", ["feature-state", "hover"], false],
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

  // Respond to building visibility toggle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const v = buildingsVisible ? "visible" : "none";
    for (const id of ["buildings-fill", "buildings-line"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", v);
    }
  }, [buildingsVisible, ready]);

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
    map.addSource(sourceId, {
      type: "raster",
      url: `cog://${window.location.origin}${conf.url}`,
      tileSize: 256,
    });
    // Insert under buildings-line so building outlines stay on top and clickable.
    map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": historicOpacity },
      },
      "buildings-line",
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

