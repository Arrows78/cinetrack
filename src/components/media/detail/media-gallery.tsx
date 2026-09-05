import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { DIALOG_OVERLAY_CLASSNAME } from "@/components/ui/sheet";
import { SectionHeader } from "@/components/media/primitives/section-header";
import { buildTmdbImageUrl } from "@/shared/utils/format";

// A lightweight lightbox over the extra backdrops TMDB's images endpoint
// returns beyond the single one already used for the hero — reuses the same
// Radix Dialog primitive ConfirmDialog is built on rather than a dedicated
// image-viewer library, since all it needs is an overlay, a close button,
// and prev/next.
export function MediaGallery({ backdropPaths }: { backdropPaths?: string[] }) {
  const { t } = useTranslation();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!backdropPaths?.length) return null;

  const showPrev = () =>
    setOpenIndex((index) => (index === null ? index : (index - 1 + backdropPaths.length) % backdropPaths.length));
  const showNext = () => setOpenIndex((index) => (index === null ? index : (index + 1) % backdropPaths.length));

  return (
    <section>
      <SectionHeader title={t("media.gallery")} />
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {backdropPaths.map((path, index) => (
          <button
            key={path}
            type="button"
            onClick={() => setOpenIndex(index)}
            className="shrink-0 overflow-hidden rounded-card border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img
              src={buildTmdbImageUrl(path, "w342")}
              alt=""
              className="h-24 w-40 object-cover transition duration-base hover:scale-105"
            />
          </button>
        ))}
      </div>
      <DialogPrimitive.Root open={openIndex !== null} onOpenChange={(open) => !open && setOpenIndex(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className={DIALOG_OVERLAY_CLASSNAME} />
          <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-modal w-[92%] max-w-4xl -translate-x-1/2 -translate-y-1/2 focus:outline-none">
            <DialogPrimitive.Title className="sr-only">{t("media.gallery")}</DialogPrimitive.Title>
            {openIndex !== null ? (
              <div className="relative">
                <img
                  src={buildTmdbImageUrl(backdropPaths[openIndex], "original")}
                  alt=""
                  className="max-h-[80vh] w-full rounded-shell border border-border object-contain"
                />
                <DialogPrimitive.Close
                  aria-label={t("common.close")}
                  className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-4" />
                </DialogPrimitive.Close>
                {backdropPaths.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={showPrev}
                      aria-label={t("media.previousImage")}
                      className="absolute left-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      type="button"
                      onClick={showNext}
                      aria-label={t("media.nextImage")}
                      className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
