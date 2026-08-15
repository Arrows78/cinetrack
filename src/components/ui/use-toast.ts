import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 5000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Listener = (toasts: ToasterToast[]) => void;

let memoryState: ToasterToast[] = [];
const listeners = new Set<Listener>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
let idCounter = 0;

function emit() {
  listeners.forEach((listener) => listener(memoryState));
}

function dismiss(id: string) {
  memoryState = memoryState.filter((toast) => toast.id !== id);
  const timeout = timeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    timeouts.delete(id);
  }
  emit();
}

function scheduleRemoval(id: string) {
  if (timeouts.has(id)) return;
  const timeout = setTimeout(() => dismiss(id), TOAST_REMOVE_DELAY);
  timeouts.set(id, timeout);
}

export type ToastInput = Omit<ToasterToast, "id">;

export function toast(input: ToastInput): { id: string; dismiss: () => void } {
  idCounter += 1;
  const id = String(idCounter);
  const entry: ToasterToast = { ...input, id };

  memoryState = [entry, ...memoryState].slice(0, TOAST_LIMIT);
  emit();
  scheduleRemoval(id);

  return { id, dismiss: () => dismiss(id) };
}

export function useToast() {
  const [toasts, setToasts] = React.useState(memoryState);

  React.useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);

  return { toasts, dismiss };
}
