"use client";

import { useEffect } from "react";
import { create } from "zustand";

/**
 * Per-photo bookmark state ({ isBookmarked, bookmarkCount }) shared across every
 * component that renders the same photo — the /photos grid cards (PhotoCard) and
 * the detail view (PhotoViewer) always read and write the SAME entry, so bookmarking
 * in one place is immediately reflected in the other.
 */
export interface BookmarkEntry {
  bookmarked: boolean;
  count: number;
}

interface BookmarksState {
  entries: Record<number, BookmarkEntry>;
  /** Seeds an entry from server data without overwriting a newer client state. */
  seed: (photoId: number, entry: BookmarkEntry) => void;
  /** Optimistically toggles, confirms with the server, rolls back on failure. */
  toggle: (photoId: number, fallback: BookmarkEntry) => Promise<boolean>;
}

export const useBookmarks = create<BookmarksState>((set, get) => ({
  entries: {},
  seed: (photoId, entry) => {
    if (get().entries[photoId]) return;
    set((s) => ({ entries: { ...s.entries, [photoId]: entry } }));
  },
  toggle: async (photoId, fallback) => {
    const current = get().entries[photoId] ?? fallback;
    const optimistic: BookmarkEntry = {
      bookmarked: !current.bookmarked,
      count: Math.max(0, current.count + (current.bookmarked ? -1 : 1)),
    };
    /* Apply the new state (isBookmarked: true + count + 1) immediately. */
    set((s) => ({ entries: { ...s.entries, [photoId]: optimistic } }));
    try {
      const res = await fetch(`/api/photos/${photoId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: optimistic.bookmarked ? "bookmark" : "unbookmark" }),
      });
      if (!res.ok) throw new Error("bookmark_failed");
      return optimistic.bookmarked;
    } catch {
      /* Server rejected (offline, 401…) — restore the previous state. */
      set((s) => ({ entries: { ...s.entries, [photoId]: current } }));
      return current.bookmarked;
    }
  },
}));

/** Shared bookmark state for a single photo, seeded from its server values. */
export function useBookmarkState(
  photoId: number,
  initialBookmarked: boolean,
  initialCount: number,
) {
  const entry = useBookmarks((s) => s.entries[photoId]);
  const seed = useBookmarks((s) => s.seed);
  const toggle = useBookmarks((s) => s.toggle);

  useEffect(() => {
    seed(photoId, { bookmarked: initialBookmarked, count: initialCount });
  }, [seed, photoId, initialBookmarked, initialCount]);

  const bookmarked = entry?.bookmarked ?? initialBookmarked;
  const count = entry?.count ?? initialCount;

  return {
    bookmarked,
    count,
    toggle: () => toggle(photoId, { bookmarked, count }),
  };
}
