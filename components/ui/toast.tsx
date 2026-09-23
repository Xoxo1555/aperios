"use client";

import { BiIcon } from "components/BiIcon";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "default" | "success" | "danger";

interface ToastState {
  open: boolean;
  title: string;
  description: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: ToastState;
  show: (params: {
    title: string;
    description?: string;
    variant?: ToastVariant;
  }) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const CLOSED: ToastState = {
  open: false,
  title: "",
  description: "",
  variant: "default",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState>(CLOSED);

  const show = (params: {
    title: string;
    description?: string;
    variant?: ToastVariant;
  }) => {
    setToast({
      open: true,
      title: params.title,
      description: params.description ?? "",
      variant: params.variant ?? "default",
    });
  };

  const hide = () => setToast(CLOSED);

  return (
    <ToastContext.Provider value={{ toast, show, hide }}>
      {children}
      <ToastUI toast={toast} onClose={hide} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

function ToastUI({
  toast,
  onClose,
}: {
  toast: ToastState;
  onClose: () => void;
}) {
  if (!toast.open) return null;

  const variantClasses = {
    success: "bg-green-500/90 text-green-100",
    danger: "bg-red-500/90 text-red-100",
    default: "bg-yellow-500/90 text-yellow-100",
  }[toast.variant];

  return (
    <div
      role="alert"
      className={`fixed top-4 right-4 max-w-sm z-50 ${variantClasses} rounded-lg px-5 py-3 shadow-lg`}
    >
      <div className="flex items-center space-x-3">
        {toast.variant === "success" ? (
          <BiIcon name="bi-check" style={{ fontSize: 20 }} />
        ) : toast.variant === "danger" ? (
          <BiIcon name="bi-x-lg" style={{ fontSize: 20 }} />
        ) : (
          <BiIcon name="bi-info-circle" style={{ fontSize: 20 }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{toast.title}</p>
          {toast.description && (
            <p className="text-sm opacity-90">{toast.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Close"
        >
          <BiIcon name="bi-x-lg" style={{ fontSize: 16 }} className="ml-1" />
        </button>
      </div>
    </div>
  );
}

export const Toast = ToastUI;