import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScaledSlideProps {
  children: ReactNode;
  className?: string;
}

/**
 * Renders the slide at a fixed 1920x1080 canvas, scaled to fit the container.
 * Container must be position:relative and overflow:hidden.
 */
export default function ScaledSlide({ children, className }: ScaledSlideProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current?.parentElement;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      setScale(Math.min(w / 1920, h / 1080));
    };
    update();
    const ro = new ResizeObserver(update);
    if (containerRef.current?.parentElement) ro.observe(containerRef.current.parentElement);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "slide-content absolute left-1/2 top-1/2 origin-center overflow-hidden bg-gradient-to-br from-background via-background to-card text-foreground",
        className
      )}
      style={{
        width: 1920,
        height: 1080,
        marginLeft: -960,
        marginTop: -540,
        transform: `scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}
