// Inert canvas behind the landing: a faint signal-grid that gives the near-black
// page the depth of an instrument panel. It is ANCHORED to the page (absolute,
// not fixed) so it scrolls with content and fades out toward the footer. The
// hero owns its own lime aura, so the glow stays a hero moment instead of
// following the scroll down every section.
export function SiteBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <div className="bg-signal-grid absolute inset-0 opacity-40 [mask-image:linear-gradient(to_bottom,black_0%,transparent_88%)]" />
    </div>
  );
}
