export default function GlobalGrid() {
  return (
    <>
      {/* Background fine grid */}
      <svg
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      >
        <defs>
          <pattern id="bg-grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#cfc39a" strokeWidth="0.22" opacity="0.14" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bg-grid)" />
      </svg>

      {/* Outer double border */}
      <div
        className="fixed pointer-events-none"
        style={{
          inset: 7,
          border: "1px solid #cfc39a",
          opacity: 0.55,
          zIndex: 1,
        }}
      />
      <div
        className="fixed pointer-events-none"
        style={{
          inset: 12,
          border: "0.4px solid #cfc39a",
          opacity: 0.28,
          zIndex: 1,
        }}
      />
    </>
  );
}
