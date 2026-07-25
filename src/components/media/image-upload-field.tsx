"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * File-input field for the Server-Action image forms. Progressive-enhancement
 * friendly: it is a plain `<input type="file">` inside the parent form, plus a
 * client preview and natural-dimension capture (hidden `${name}_width/height`).
 *
 * When an image already exists, a "Remove" toggle posts `${name}_remove=on` so
 * the action can clear the column. The parent form owns submission.
 */
export function ImageUploadField({
  name,
  label,
  currentUrl,
  hint,
  aspect = "square",
  errors,
}: {
  name: string;
  label: string;
  currentUrl?: string | null;
  hint?: string;
  aspect?: "square" | "wide";
  errors?: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [remove, setRemove] = useState(false);

  const shown = preview ?? (remove ? null : (currentUrl ?? null));
  const errorId = `${name}-error`;
  const hasError = Boolean(errors?.length);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setPreview(null);
      setDims(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    setRemove(false);
    const img = new window.Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }

  function clearPicked() {
    if (inputRef.current) inputRef.current.value = "";
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setDims(null);
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>

      <div className="flex items-start gap-4">
        <div
          className={cn(
            "bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden rounded-md border",
            aspect === "square" ? "size-20" : "h-20 w-32",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob/remote preview, not a static asset
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-xs">No image</span>
          )}
        </div>

        <div className="grid gap-2">
          <input
            ref={inputRef}
            id={name}
            name={name}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            onChange={onPick}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : undefined}
            className="file:bg-secondary text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}

          <div className="flex gap-2">
            {preview ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearPicked}>
                Cancel
              </Button>
            ) : null}
            {currentUrl && !preview ? (
              <Button
                type="button"
                variant={remove ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setRemove((r) => !r)}
              >
                {remove ? "Keep image" : "Remove image"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Server-read side channels. */}
      <input type="hidden" name={`${name}_width`} value={dims?.w ?? ""} readOnly />
      <input type="hidden" name={`${name}_height`} value={dims?.h ?? ""} readOnly />
      <input type="hidden" name={`${name}_remove`} value={remove ? "on" : ""} readOnly />

      {hasError ? (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {errors!.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
