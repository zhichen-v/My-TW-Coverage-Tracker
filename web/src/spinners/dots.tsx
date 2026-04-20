"use client";

import { useEffect, useState } from "react";

const FRAMES = [".  ", ".. ", "...", " ..", "  .", "   "];
const INTERVAL = 80;

type DotsSpinnerProps = {
  active?: boolean;
  size?: number;
  color?: string;
  className?: string;
};

export function DotsSpinner({
  active = true,
  size = 18,
  color = "var(--accent)",
  className,
}: DotsSpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      return;
    }

    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % FRAMES.length);
    }, INTERVAL);

    return () => window.clearInterval(id);
  }, [active]);

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        color: "#FFF",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-mono)",
        fontSize: size,
        fontWeight: 800,
        fontVariantLigatures: "none",
        lineHeight: 1,
        minWidth: "3ch",
        textShadow: "0 0 10px rgba(250, 255, 105, 0.24)",
        whiteSpace: "pre",
      }}
    >
      {FRAMES[frame]}
    </span>
  );
}
