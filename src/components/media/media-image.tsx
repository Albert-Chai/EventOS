import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Renders an uploaded image from its public URL, or a labelled placeholder when
 * none is set yet (the reserved `*_file_id` columns are often empty). One
 * component so every surface — cards, covers, thumbnails — degrades the same way
 * before the media pass fills a column in.
 */
export function MediaImage({
  src,
  alt,
  width,
  height,
  fallback,
  className,
  rounded = "md",
}: {
  src: string | null | undefined;
  alt: string;
  width: number;
  height: number;
  /** Shown in the placeholder when there is no image (e.g. merchant initials). */
  fallback?: string;
  className?: string;
  rounded?: "none" | "md" | "lg" | "full";
}) {
  const radius = {
    none: "",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];

  if (!src) {
    return (
      <div
        aria-hidden
        style={{ aspectRatio: `${width} / ${height}` }}
        className={cn(
          "bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium",
          radius,
          className,
        )}
      >
        {fallback ? initials(fallback) : null}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={cn("object-cover", radius, className)}
    />
  );
}

function initials(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
