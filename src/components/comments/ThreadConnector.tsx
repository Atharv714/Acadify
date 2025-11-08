"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAvatarRegistry } from "./AvatarRegistry";

type Link = { fromId: string; toId: string; key?: string; stroke?: string };

export function ThreadConnector({ links = [] }: { links: Link[] }) {
  const reg = useAvatarRegistry();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [renderData, setRenderData] = useState<{
    spine: { x: number; y1: number; y2: number } | null;
    horizontals: Array<{ x1: number; y: number; x2: number }>;
  }>({ spine: null, horizontals: [] });

  useEffect(() => {
    let raf = 0;
    const compute = () => {
      const svg = svgRef.current;
      const cont = containerRef.current;
      if (!svg || !cont) return;
      const rect = cont.getBoundingClientRect();

      const pairs: Array<{ sx: number; sy: number; ex: number; ey: number }> = [];
      for (const l of links) {
        const from = reg.get(l.fromId);
        const to = reg.get(l.toId);
        if (!from || !to) continue;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const sx = a.left + a.width / 2 - rect.left;
        const sy = a.top + a.height / 2 - rect.top;
        const ex = b.left + b.width / 2 - rect.left;
        const ey = b.top + b.height / 2 - rect.top;
        pairs.push({ sx, sy, ex, ey });
      }

      if (pairs.length === 0) {
        setRenderData({ spine: null, horizontals: [] });
        return;
      }

      const sx = pairs[0].sx; // parent avatar center x
      const yStart = pairs[0].sy + 24; // Add gap below parent avatar (avatar radius ~18px + 6px gap)
      const cornerRadius = 12; // Increased from 8 to match reference design
      const yEnd = Math.max(...pairs.map((p) => p.ey)) - cornerRadius - 4; // Stop before last reply with extra gap
      const spineX = sx;

      // Horizontals: shorten by avatar radius so they don't overlap the reply avatar
      const horizontals = pairs.map((p) => ({ x1: spineX, y: p.ey, x2: p.ex - 22 }));
      setRenderData({ spine: { x: spineX, y1: yStart, y2: yEnd }, horizontals });
    };

    const tick = () => {
      compute();
      raf = requestAnimationFrame(tick);
    };

    const ro = new ResizeObserver(() => compute());
    ro.observe(document.documentElement);
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    compute();
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, [links, reg]);

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none z-10">
      <svg ref={svgRef} className="w-full h-full" preserveAspectRatio="none">
        {renderData.spine && (
          <path
            className="text-zinc-200 dark:text-neutral-900"
            d={`M ${renderData.spine.x} ${renderData.spine.y1} L ${renderData.spine.x} ${renderData.spine.y2}`}
            strokeWidth={1.25}
            stroke="currentColor"
            fill="none"
            strokeLinecap="round"
          />
        )}
        {renderData.horizontals.map((h, i) => {
          // Create rounded corner: vertical segment down to reply height, then horizontal to reply
          const cornerRadius = 12; // Increased from 8 to match reference design
          const verticalStart = renderData.spine?.y1 || h.y;
          const path = `M ${h.x1} ${verticalStart} L ${h.x1} ${h.y - cornerRadius} Q ${h.x1} ${h.y}, ${h.x1 + cornerRadius} ${h.y} L ${h.x2} ${h.y}`;
          
          return (
            <path
              key={i}
              className="text-zinc-200 dark:text-neutral-900"
              d={path}
              strokeWidth={1.25}
              stroke="currentColor"
              fill="none"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </div>
  );
}
