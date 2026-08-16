import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

// Only the variants actually used anywhere in the app today (grep `toast({`)
// — "default" has no current caller, so it stays icon-less rather than
// inventing a glyph nothing renders yet.
const ICON_BY_VARIANT: Partial<Record<string, LucideIcon>> = {
  success: CheckCircle2,
  error: XCircle,
};

// Mounted once at the app root (see main.tsx) — every toast(...) call
// anywhere in the app renders through this single ToastProvider/Viewport.
export function Toaster() {
  const { t } = useTranslation();
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant, ...props }) => {
        const Icon = variant ? ICON_BY_VARIANT[variant] : undefined;
        return (
          <Toast key={id} variant={variant} onOpenChange={(open) => !open && dismiss(id)} {...props}>
            {/* Color comes from the Toast root's own text-success/text-destructive
                (see toastVariants) — currentColor, no separate color class needed. */}
            {Icon ? <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : null}
            <div className="grid min-w-0 flex-1 gap-1">
              {title ? <ToastTitle>{title}</ToastTitle> : null}
              {description ? <ToastDescription>{description}</ToastDescription> : null}
            </div>
            {action}
            <ToastClose closeLabel={t("common.close")} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
