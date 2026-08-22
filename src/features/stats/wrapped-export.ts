// Renders shareable PNG cards for Wrapped, monthly recaps and watch
// milestones — purely with the Canvas 2D API, no DOM-rasterization library
// (html2canvas/dom-to-image) and no new Tauri capability. Saving reuses the
// same browser-native `<a download>` blob flow BackupTools already uses for
// its JSON export (see backup-tools.tsx's exportBackup), which the Tauri
// webview handles like a normal download — so this also works in plain
// browser preview (pnpm dev), unlike an IPC-backed file write would.
//
// All three card types share one visual family (background gradient, panel,
// brand header, divider, typography scale) via the helpers below, so they
// read as one system rather than three unrelated designs.

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;
const PADDING = 84;

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

interface CardColors {
  background: string;
  foreground: string;
  muted: string;
  primary: string;
  primaryDim: string;
  cardFill: string;
  border: string;
}

interface CardShell {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  colors: CardColors;
  panelY: number;
  left: number;
  right: number;
  contentWidth: number;
}

/** Builds the canvas, reads the app's live theme tokens, and paints the shared background gradient + panel — throws if canvas 2D is unavailable (should never happen in a webview/browser). */
function createCardShell(): CardShell {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const colors: CardColors = {
    background: hsl("--background"),
    foreground: hsl("--foreground"),
    muted: hsl("--muted-foreground"),
    primary: hsl("--primary"),
    primaryDim: hsl("--primary", 0.12),
    cardFill: hsl("--card", 0.6),
    border: hsl("--border"),
  };

  // Background gradient — a diagonal wash of the accent over the app's own
  // background token, echoing the Wrapped Panel's `tone="highlight"` look.
  const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
  gradient.addColorStop(0, colors.background);
  gradient.addColorStop(1, colors.primaryDim);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // Inner card panel, mirroring the app's Panel primitive (rounded, subtle border).
  const panelX = PADDING / 2;
  const panelY = PADDING / 2;
  const panelWidth = CARD_WIDTH - PADDING;
  const panelHeight = CARD_HEIGHT - PADDING;
  roundedRectPath(ctx, panelX, panelY, panelWidth, panelHeight, 48);
  ctx.fillStyle = colors.cardFill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = colors.border;
  ctx.stroke();

  const left = panelX + 64;
  const right = panelX + panelWidth - 64;

  return { canvas, ctx, colors, panelY, left, right, contentWidth: right - left };
}

/** Draws the shared brand block every card type opens with; returns the y cursor to continue drawing from. */
function drawBrandHeader(
  ctx: CanvasRenderingContext2D,
  colors: CardColors,
  left: number,
  panelY: number,
  brand: string,
  tagline: string
): number {
  const y = panelY + 110;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colors.primary;
  ctx.font = "700 34px system-ui, sans-serif";
  ctx.fillText(brand, left, y);
  ctx.fillStyle = colors.muted;
  ctx.font = "400 24px system-ui, sans-serif";
  ctx.fillText(tagline, left, y + 36);
  return y;
}

function drawDivider(ctx: CanvasRenderingContext2D, colors: CardColors, left: number, right: number, y: number): void {
  ctx.strokeStyle = colors.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(right, y);
  ctx.stroke();
}

function resolveBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob() returned null"))), "image/png");
  });
}

/** Triggers a browser-native download of the blob — same mechanism as BackupTools' JSON export. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

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

export async function renderWrappedCard(data: WrappedExportData, labels: WrappedExportLabels): Promise<Blob> {
  const { canvas, ctx, colors, left, right, contentWidth, panelY } = createCardShell();
  let y = drawBrandHeader(ctx, colors, left, panelY, labels.brand, labels.tagline);

  // Year + "Wrapped".
  y += 170;
  ctx.fillStyle = colors.foreground;
  ctx.font = "800 150px system-ui, sans-serif";
  ctx.fillText(String(data.year), left, y);
  y += 56;
  ctx.fillStyle = colors.primary;
  ctx.font = "700 42px system-ui, sans-serif";
  ctx.fillText(labels.wrappedTitle, left, y);

  y += 56;
  drawDivider(ctx, colors, left, right, y);

  // Headline stat: hours watched.
  y += 96;
  ctx.fillStyle = colors.foreground;
  ctx.font = "800 84px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.hoursWatchedLabel, contentWidth), left, y);

  // Secondary stats.
  y += 56;
  ctx.fillStyle = colors.muted;
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
    ctx.fillStyle = colors.foreground;
    ctx.font = "700 36px system-ui, sans-serif";
    for (const [index, item] of data.topTitles.entries()) {
      const line = ellipsize(ctx, `${index + 1}. ${item.title} · ${item.count}`, contentWidth);
      ctx.fillText(line, left, y);
      y += 52;
    }
  }

  return resolveBlob(canvas);
}

export function downloadWrappedCard(blob: Blob, year: number): void {
  triggerDownload(blob, `cinetrack-wrapped-${year}.png`);
}

export interface MonthlyRecapExportData {
  monthLabel: string;
  timeWatchedLabel: string;
  moviesEpisodesLabel: string;
  topRatedTitle: string | null;
  favouriteGenre: string | null;
  biggestBinge: string | null;
}

export interface MonthlyRecapExportLabels {
  brand: string;
  tagline: string;
  recapTitle: string;
  topRatedTitleLabel: string;
  favouriteGenreLabel: string;
  biggestBingeLabel: string;
}

export async function renderMonthlyRecapCard(
  data: MonthlyRecapExportData,
  labels: MonthlyRecapExportLabels
): Promise<Blob> {
  const { canvas, ctx, colors, left, right, contentWidth, panelY } = createCardShell();
  let y = drawBrandHeader(ctx, colors, left, panelY, labels.brand, labels.tagline);

  // Month + "Monthly recap".
  y += 170;
  ctx.fillStyle = colors.foreground;
  ctx.font = "800 72px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.monthLabel, contentWidth), left, y);
  y += 56;
  ctx.fillStyle = colors.primary;
  ctx.font = "700 42px system-ui, sans-serif";
  ctx.fillText(labels.recapTitle, left, y);

  y += 56;
  drawDivider(ctx, colors, left, right, y);

  // Headline stat: time watched.
  y += 96;
  ctx.fillStyle = colors.foreground;
  ctx.font = "800 84px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.timeWatchedLabel, contentWidth), left, y);

  // Secondary stat: movies/episodes.
  y += 56;
  ctx.fillStyle = colors.muted;
  ctx.font = "400 32px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.moviesEpisodesLabel, contentWidth), left, y);

  const detailRows: Array<[string, string | null]> = [
    [labels.topRatedTitleLabel, data.topRatedTitle],
    [labels.favouriteGenreLabel, data.favouriteGenre],
    [labels.biggestBingeLabel, data.biggestBinge],
  ];
  for (const [label, value] of detailRows) {
    if (!value) continue;
    y += 48;
    ctx.fillText(ellipsize(ctx, `${label} ${value}`, contentWidth), left, y);
  }

  return resolveBlob(canvas);
}

export function downloadMonthlyRecapCard(blob: Blob, month: string): void {
  triggerDownload(blob, `cinetrack-recap-${month}.png`);
}

export interface MilestoneExportData {
  milestoneLabel: string;
  achievedDateLabel: string | null;
}

export interface MilestoneExportLabels {
  brand: string;
  tagline: string;
  milestoneTitle: string;
  achievedLabel: string;
}

export async function renderMilestoneCard(data: MilestoneExportData, labels: MilestoneExportLabels): Promise<Blob> {
  const { canvas, ctx, colors, left, right, contentWidth, panelY } = createCardShell();
  let y = drawBrandHeader(ctx, colors, left, panelY, labels.brand, labels.tagline);

  // "Milestone unlocked" + the achieved milestone's own label.
  y += 170;
  ctx.fillStyle = colors.primary;
  ctx.font = "700 42px system-ui, sans-serif";
  ctx.fillText(labels.milestoneTitle, left, y);

  y += 96;
  ctx.fillStyle = colors.foreground;
  ctx.font = "800 72px system-ui, sans-serif";
  ctx.fillText(ellipsize(ctx, data.milestoneLabel, contentWidth), left, y);

  y += 56;
  drawDivider(ctx, colors, left, right, y);

  if (data.achievedDateLabel) {
    y += 72;
    ctx.fillStyle = colors.muted;
    ctx.font = "400 32px system-ui, sans-serif";
    ctx.fillText(ellipsize(ctx, `${labels.achievedLabel} ${data.achievedDateLabel}`, contentWidth), left, y);
  }

  return resolveBlob(canvas);
}

export function downloadMilestoneCard(blob: Blob, slug: string): void {
  triggerDownload(blob, `cinetrack-milestone-${slug}.png`);
}
