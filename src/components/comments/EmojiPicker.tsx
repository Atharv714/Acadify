"use client";

import { useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Smile } from "lucide-react";

const DEFAULT_EMOJIS = [
  "👍","❤️","😂","🎉","🔥","👏","😮","😢","🙏","😄",
  "😊","😎","🤔","🙌","💯","✅","🚀","🎯","🍀","🥳",
  "🤝","💡","⚡","🧠","🛠️","📌","📈","🔁","🕒","🔒"
];

export function EmojiPicker({
  onSelect,
  size = 20,
  emojis = DEFAULT_EMOJIS,
  triggerClassName,
}: {
  onSelect: (emoji: string) => void;
  size?: number;
  emojis?: string[];
  triggerClassName?: string;
}) {
  const grid = useMemo(() => emojis, [emojis]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={triggerClassName || "p-1.5 hover:bg-muted rounded-md"} title="Add reaction">
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-2">
        <div className="grid grid-cols-8 gap-1">
          {grid.map((e) => (
            <button
              key={e}
              className="h-7 w-7 text-base hover:bg-muted rounded"
              onClick={() => onSelect(e)}
              title={e}
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
