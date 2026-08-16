// Renders the Wrapped summary as a shareable PNG card, purely with the
// Canvas 2D API — no DOM-rasterization library (html2canvas/dom-to-image)
// and no new Tauri capability. Saving reuses the same browser-native
// `<a download>` blob flow BackupTools already uses for its JSON export
// (see backup-tools.tsx's exportBackup), which the Tauri webview handles
// like a normal download — so this also works in plain browser preview
// (pnpm dev), unlike an IPC-backed file write would.

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const PADDING = 84;

export interface WrappedExportData {
  year: number;
  hoursWatchedLabel: string;
  moviesEpisodesLabel: string;
  favouriteGenre: string | null;
  activeDaysLabel: string;
  topTitles: Array<{ title: string; count: number }>;
}

export interface WrappedExportLabels {
  brand: string;
  tagline: string;
  wrappedTitle: string;
  favouriteGenreLabel: string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Reads a `H S% L%` custom property (this app's HSL token format) as a canvas-usable color string. */
function hsl(name: string, alpha = 1): string {
  const [h, s, l] = cssVar(name).split(/\s+/);
  return alpha === 1 ? `hsl(${h}, ${s}, ${l})` : `hsla(${h}, ${s}, ${l}, ${alpha})`;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Draws the card and resolves a PNG blob — throws if canvas 2D is unavailable (should never happen in a webview/browser). */
export async function renderWrappedCard(data: WrappedExportData, labels: WrappedExportLabels): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const background = hsl("--background");
  const foreground = hsl("--foreground");
  const muted = hsl("--muted-foreground");
  const primary = hsl("--primary");
  const primaryDim = hsl("--primary", 0.12);
  const cardFill = hsl("--card", 0.6);
  const border = hsl("--border");

  // Background gradient — a diagonal wash of the accent over the app's own
  // background token, echoing the Wrapped Panel's `tone="highlight"` look.
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, primaryDim);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Inner card panel, mirroring the app's Panel primitive (rounded, subtle border).
  const panelX = PADDING / 2;
  const panelY = PADDING / 2;
  const panelWidth = CARD_WIDTH - PADDING;
  const panelHeight = CARD_HEIGHT - PADDING;
  roundedRectPath(ctx, panelX, panelY, panelWidth, panelHeight, 48);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = border;
  ctx.stroke();

  const left = panelX + 64;
  const right = panelX + panelWidth - 64;
  const contentWidth = right - left;
  let y = panelY + 110;

  // Brand.
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = primary;
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText(labels.brand, left, y);
  ctx.fillStyle = muted;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText(labels.tagline, left, y + 36);

  // Year + "Wrapped".
  y += 170;
  ctx.fillStyle = foreground;
  ctx.font = "800 150px system-ui, sans-serif";
  ctx.fillText(String(data.year), left, y);
  y += 56;
  ctx.fillStyle = primary;
  ctx.font = "700 42px system-ui, sans-serif";
  ctx.fillText(labels.wrappedTitle, left, y);

  // Divider.
  y += 56;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();

  // Headline stat: hours watched.
  y += 96;
  ctx.fillStyle = foreground;
  ctx.font = "800 84px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.hoursWatchedLabel, contentWidth), left, y);

  // Secondary stats.
  y += 56;
  ctx.fillStyle = muted;
  ctx.font = "400 32px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.moviesEpisodesLabel, contentWidth), left, y);

  y += 48;
  ctx.fillText(ellipsize(ctx, data.activeDaysLabel, contentWidth), left, y);

  if (data.favouriteGenre) {
    y += 48;
    ctx.fillText(ellipsize(ctx, `${labels.favouriteGenreLabel} ${data.favouriteGenre}`, contentWidth), left, y);
  }

  // Top titles.
  if (data.topTitles.length) {
    y += 76;
    ctx.fillStyle = foreground;
    ctx.font = "700 36px system-ui, sans-serif";
    for (const [index, item] of data.topTitles.entries()) {
      const line = ellipsize(ctx, `${index + 1}. ${item.title} · ${item.count}`, contentWidth);
      ctx.fillText(line, left, y);
      y += 52;
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob() returned null"))), "image/png");
  });
}

/** Triggers a browser-native download of the blob — same mechanism as BackupTools' JSON export. */
export function downloadWrappedCard(blob: Blob, year: number): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `cinetrack-wrapped-${year}.png`;
  anchor.click();
  URL.revokeObjectURL(url);
}
