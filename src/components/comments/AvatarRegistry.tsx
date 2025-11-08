"use client";

import React, { createContext, useContext, useRef } from "react";

type Registry = {
  register: (id: string, el: HTMLElement | null) => void;
  get: (id: string) => HTMLElement | null;
  listIds: () => string[];
};

const ctx = createContext<Registry | null>(null);

export function AvatarRegistryProvider({ children }: { children: React.ReactNode }) {
  const mapRef = useRef<Map<string, HTMLElement | null>>(new Map());
  const registry: Registry = {
    register: (id: string, el: HTMLElement | null) => mapRef.current.set(id, el),
    get: (id: string) => mapRef.current.get(id) || null,
    listIds: () => Array.from(mapRef.current.keys()),
  };
  return <ctx.Provider value={registry}>{children}</ctx.Provider>;
}

export const useAvatarRegistry = () => {
  const r = useContext(ctx);
  if (!r) throw new Error("useAvatarRegistry must be used inside AvatarRegistryProvider");
  return r;
};
