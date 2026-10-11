// Bin sticker: 100mm x 50mm, one label per page. Printed labels are always
// dark-on-light for scanner contrast, so colors are fixed literals here.
export const LABEL = { bg: "#F1F4F9", ink: "#0F1B2D", accent: "#D32F2F", qrBg: "#FFFFFF" };
// 100mm x 50mm in PostScript points (1mm = 2.8346pt)
export const LABEL_PT = { width: 283, height: 142 };

export type LabelData = { code: string; title: string; data_uri: string };

export function splitCode(code: string) {
  const i = code.indexOf("-");
  return i > 0 ? [code.slice(0, i), code.slice(i)] : [code, ""];
}

export function labelsHtml(labels: LabelData[]) {
  const pages = labels.map((l) => {
    const [head, rest] = splitCode(l.code);
    return `<div class="l"><div class="t"><div class="n">${l.title}</div><div class="c"><span class="a">${head}</span>${rest}</div></div><div class="q"><img src="${l.data_uri}"/></div></div>`;
  }).join("");
  return `<html><head><meta charset="utf-8"/><style>
    @page { size: 100mm 50mm; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { margin: 0; padding: 0; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
    .l { width: 100mm; height: 50mm; background: ${LABEL.bg}; display: flex; align-items: center; justify-content: space-between;
         padding: 0 5mm 0 7mm; page-break-after: always; break-after: page; overflow: hidden; }
    .l:last-child { page-break-after: auto; break-after: auto; }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4mm; }
    .n { font-size: 26pt; font-weight: 800; color: ${LABEL.ink}; letter-spacing: 0.5pt; line-height: 1; white-space: nowrap; }
    .c { font-size: 15pt; font-weight: 800; color: ${LABEL.ink}; line-height: 1; white-space: nowrap; }
    .a { color: ${LABEL.accent}; }
    .q { width: 40mm; height: 40mm; background: ${LABEL.qrBg}; border-radius: 2mm; padding: 1.5mm; flex-shrink: 0; }
    .q img { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
  </style></head><body>${pages}</body></html>`;
}

export async function printLabels(labels: LabelData[]) {
  const Print = await import("expo-print");
  await Print.printAsync({ html: labelsHtml(labels), width: LABEL_PT.width, height: LABEL_PT.height });
}
