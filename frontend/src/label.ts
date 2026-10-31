// Wide bin sticker: 100mm x 30mm, one label per page. Printed labels are always
// dark-on-light for scanner contrast, so colors are fixed literals here.
import { mapSections } from "@/src/warehouseMap";

export const LABEL = { bg: "#F1F5F9", ink: "#0F172A", accent: "#D32F2F", qrBg: "#FFFFFF" };
export const LABEL_PT = { width: 283, height: 85 };
export const LABEL_RATIO = 100 / 30;
export const labelAccent = (code: string) => mapSections.find(section => section.code === splitCode(code)[0])?.color || LABEL.accent;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));

export type LabelData = { code: string; title: string; data_uri: string };

export function splitCode(code: string) {
  const i = code.indexOf("-");
  return i > 0 ? [code.slice(0, i), code.slice(i)] : [code, ""];
}

export function labelsHtml(labels: LabelData[]) {
  const pages = labels.map((l) => {
    const [head, rest] = splitCode(l.code);
    const titleSize = Math.min(45, 180 / (Math.max(l.title.length, 1) * 0.62));
    const codeSize = Math.min(19, 180 / (Math.max(l.code.length, 1) * 0.62));
    return `<div class="l"><div class="t"><div class="n" style="font-size:${titleSize}pt">${escapeHtml(l.title)}</div><div class="c" style="font-size:${codeSize}pt"><span class="a" style="color:${labelAccent(l.code)}">${escapeHtml(head)}</span>${escapeHtml(rest)}</div></div><div class="q"><img alt="Bin QR code" src="${escapeHtml(l.data_uri)}"/></div></div>`;
  }).join("");
  return `<html><head><meta charset="utf-8"/><style>
    @page { size: 100mm 30mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
    .l { width: 100mm; height: 30mm; background: ${LABEL.bg}; display: flex; align-items: center; justify-content: space-between;
         padding: 0 3mm 0 5.5mm; gap: 3mm; page-break-after: always; break-after: page; overflow: hidden; }
    .l:last-child { page-break-after: auto; break-after: auto; }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0; }
    .n { font-size: 26pt; font-weight: 800; color: ${LABEL.ink}; letter-spacing: 0.5pt; line-height: 1; white-space: nowrap; }
    .c { font-size: 15pt; font-weight: 800; color: ${LABEL.ink}; line-height: 1; white-space: nowrap; }
    .a { color: ${LABEL.accent}; }
    .q { width: 24mm; height: 24mm; background: ${LABEL.qrBg}; flex-shrink: 0; }
    .q img { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
  </style></head><body>${pages}</body></html>`;
}

export async function printLabels(labels: LabelData[]) {
  const Print = await import("expo-print");
  await Print.printAsync({ html: labelsHtml(labels), width: LABEL_PT.width, height: LABEL_PT.height });
}
