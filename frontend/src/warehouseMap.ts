// Reference geometry follows the supplied Revision 03 overview, not surveyed dimensions.
export const mapSections = [
  { code: "SEC1", bays: 15, levels: 4, color: "#d6343b", x: 30, y: 25, width: 1000, height: 140 },
  { code: "SEC2", bays: 6, levels: 2, color: "#c86708", x: 910, y: 185, width: 120, height: 320 },
  { code: "SEC3", bays: 12, levels: 4, color: "#2865df", x: 735, y: 535, width: 295, height: 170 },
  { code: "SEC4", bays: 14, levels: 4, color: "#128153", x: 30, y: 535, width: 680, height: 170 },
];

// Counts are indexed from ground level (L1) upward. SEC4 lower-level numbering
// and alignment remain provisional until confirmed against the physical racks.
export function baysOnLevel(section: typeof mapSections[number], level: number) {
  if (level < 1 || level > section.levels) return 0;
  return section.code === "SEC4" && level <= 2 ? 8 : section.bays;
}

export function locateBin(code?: string | null) {
  const match = /^\s*(SEC[1-4])-L([1-4])-B([1-9]\d*)\s*$/i.exec(code || "");
  if (!match) return null;
  const section = mapSections.find(s => s.code === match[1].toUpperCase())!;
  const level = Number(match[2]), bay = Number(match[3]);
  if (bay > baysOnLevel(section, level)) return null;
  return { section, level, bay, code: `${section.code}-L${level}-B${bay}` };
}

export function rackOffset(code: string, viewport: number) {
  const target = locateBin(code);
  if (!target) return 0;
  const rowWidth = Math.max(900, target.section.bays * 64 + 130) - 131;
  const binsWidth = baysOnLevel(target.section, target.level) * 64 - 4;
  return Math.max(0, 73 + (rowWidth - binsWidth) / 2 + (target.bay - 0.5) * 64 - viewport / 2);
}
