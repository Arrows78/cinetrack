import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useConfetti } from "@/hooks/use-confetti";

export function SeenToggle({
  seen,
  onToggle,
  labelSeen,
  labelUnseen,
  disabled,
  celebrateOnSeen = true,
}: {
  seen: boolean;
  onToggle: () => void;
  labelSeen?: string;
  labelUnseen?: string;
  disabled?: boolean;
  celebrateOnSeen?: boolean;
}) {
  const { t } = useTranslation();
  const { celebrate, burstFromRef } = useConfetti();
  const ref = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (disabled) return;
    if (!seen && celebrateOnSeen) {
      burstFromRef(ref.current);
      setTimeout(celebrate, 300);
    }
    onToggle();
  };

  return (
    <motion.button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      whileTap={{ scale: 0.93 }}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-full px-6 py-3 text-sm font-semibold transition-all duration-base disabled:cursor-not-allowed disabled:opacity-50",
        seen
          ? "bg-primary text-primary-foreground shadow-glow"
          : "border border-foreground/20 bg-foreground/5 text-foreground hover:border-primary/40 hover:bg-primary/10"
      )}
    >
      {/* Animated circle check */}
      <div className="relative h-5 w-5">
        <AnimatePresence mode="wait">
          {seen ? (
            <motion.div
              key="checked"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <Check className="h-5 w-5" strokeWidth={3} />
            </motion.div>
          ) : (
            <motion.div
              key="unchecked"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="h-5 w-5 rounded-full border-2 border-current" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <span>{seen ? (labelSeen ?? t("media.seen")) : (labelUnseen ?? t("media.markAsSeen"))}</span>

      {/* Ripple on seen */}
      {seen && (
        <motion.div
          className="absolute inset-0 bg-primary-foreground/10"
          initial={{ scale: 0, opacity: 0.4 }}
          animate={{ scale: 2, opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}
    </motion.button>
  );
}
