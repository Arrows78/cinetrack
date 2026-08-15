import { useTranslation } from "react-i18next";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

// Mounted once at the app root (see main.tsx) — every toast(...) call
// anywhere in the app renders through this single ToastProvider/Viewport.
export function Toaster() {
  const { t } = useTranslation();
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant, ...props }) => (
        <Toast key={id} variant={variant} onOpenChange={(open) => !open && dismiss(id)} {...props}>
          <div className="grid gap-1">
            {title ? <ToastTitle>{title}</ToastTitle> : null}
            {description ? <ToastDescription>{description}</ToastDescription> : null}
          </div>
          {action}
          <ToastClose closeLabel={t("common.close")} />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
