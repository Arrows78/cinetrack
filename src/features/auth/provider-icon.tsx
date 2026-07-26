import type { SVGProps } from "react";

import type { SocialAuthProvider } from "@/features/auth/auth-client";

interface ProviderIconProps extends SVGProps<SVGSVGElement> {
  provider: SocialAuthProvider;
}

export function ProviderIcon({ provider, ...props }: ProviderIconProps) {
  if (provider === "google") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
        <path
          fill="#4285F4"
          d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z"
        />
        <path
          fill="#34A853"
          d="M12 22c2.7 0 4.98-.9 6.63-2.42l-3.25-2.53c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
        />
        <path
          fill="#FBBC05"
          d="M6.39 13.88A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.88V7.51H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.49l3.35-2.61Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.99c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.64 9.64 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.61C7.18 7.75 9.39 5.99 12 5.99Z"
        />
      </svg>
    );
  }

  if (provider === "facebook") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
        <path
          fill="currentColor"
          d="M13.7 22v-8.2h2.75l.41-3.2H13.7V8.56c0-.93.26-1.56 1.59-1.56H17V4.14A23 23 0 0 0 14.53 4c-2.44 0-4.1 1.49-4.1 4.22v2.36H7.67v3.2h2.76V22h3.27Z"
        />
      </svg>
    );
  }

  if (provider === "apple") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
        <path
          fill="currentColor"
          d="M17.05 12.54c.03 3.1 2.72 4.13 2.75 4.15-.02.08-.43 1.49-1.42 2.95-.86 1.26-1.75 2.51-3.16 2.54-1.38.03-1.83-.82-3.42-.82-1.58 0-2.08.8-3.39.85-1.36.05-2.4-1.36-3.27-2.62-1.78-2.57-3.14-7.26-1.31-10.43a5.08 5.08 0 0 1 4.31-2.6c1.35-.03 2.62.91 3.42.91.8 0 2.31-1.13 3.89-.96.66.03 2.52.27 3.71 2.01-.1.06-2.22 1.3-2.11 4.02ZM14.41 4.84c.72-.87 1.2-2.08 1.07-3.29-1.04.04-2.3.69-3.05 1.56-.67.77-1.26 2-1.1 3.18 1.16.09 2.35-.59 3.08-1.45Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.25-8.29L2.96 2h6.4l4.42 5.84L18.9 2Zm-1.1 17.84h1.72L8.42 4.05H6.57L17.8 19.84Z"
      />
    </svg>
  );
}
