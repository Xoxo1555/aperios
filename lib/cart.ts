"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItem {
  key: string;
  photoId: number;
  slug: string;
  title: string;
  imageUrl: string;
  photographerName: string;
  sizeLabel: string;
  mountName: string;
  editionNumber: number;
  unitPrice: number;
  qty: number;
}

interface CartState {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: Omit<CartItem, "key">) => void;
  removeItem: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
}

function makeKey(item: Omit<CartItem, "key">): string {
  return `${item.photoId}-${item.sizeLabel}-${item.mountName}`;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      addItem: (item) => {
        const key = makeKey(item);
        const existing = get().items.find((i) => i.key === key);
        if (existing) {
          set({
            items: get().items.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i)),
          });
        } else {
          set({ items: [...get().items, { ...item, key }] });
        }
      },
      removeItem: (key) => set({ items: get().items.filter((i) => i.key !== key) }),
      setQty: (key, qty) =>
        set({
          items: get().items.map((i) => (i.key === key ? { ...i, qty: Math.max(1, qty) } : i)),
        }),
      clear: () => set({ items: [] }),
      setOpen: (open) => set({ isOpen: open }),
    }),
    { name: "aperio-cart" },
  ),
);

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}
