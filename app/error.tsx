"use client";

import { useEffect } from "react";

/**
 * Root error boundary — catches unhandled render/data errors (e.g. a Neon
 * connection drop) and renders a recoverable card instead of a blank screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/error] unhandled error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="container py-5 d-flex justify-content-center">
      <div
        className="p-4 rounded-3 text-center"
        style={{
          maxWidth: 520,
          border: "1px solid var(--ap-border)",
          background: "var(--ap-surface)",
        }}
      >
        <h1 className="h5 mb-2">Something went wrong</h1>
        <p className="text-secondary mb-4" style={{ fontSize: "0.95rem" }}>
          We couldn&apos;t load this page. Please try again in a moment.
        </p>
        <button type="button" className="btn btn-warning" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </div>
  );
}
