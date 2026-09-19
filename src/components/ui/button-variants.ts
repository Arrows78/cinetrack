import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-default disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:opacity-95 shadow-glow",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-secondary/70 hover:text-foreground",
        outline: "border border-border bg-card/60 hover:bg-card",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-95",
        // Always-dark auth screens (sign-in/OTP/create-profile) — same
        // height and radius as the OAuth rows on that panel.
        authPrimary: "rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 rounded-xl px-3",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
        auth: "h-12 w-full px-6 text-body-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
