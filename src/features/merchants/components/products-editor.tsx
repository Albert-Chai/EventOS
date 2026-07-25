"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/media/media-image";
import { ITEM_AVAILABILITY_LABELS, type ItemAvailability } from "@/server/merchants/status";

import { formatPrice } from "../format";
import { deleteItemAction } from "../portal-actions";
import { ItemForm, type ItemView } from "./item-form";
import { ItemImageForm } from "./item-image-form";

/**
 * The merchant's products editor. Items can be added/edited/removed only while
 * the listing is editable (draft or changes-requested); otherwise they render
 * read-only. Each mutation is a server action re-checked in the service.
 */
export function ProductsEditor({
  merchantId,
  participationId,
  items,
  editable,
}: {
  merchantId: string;
  participationId: string;
  items: ItemView[];
  editable: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No items yet.</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border p-3">
              {editable && editingId === item.id ? (
                <div className="grid gap-4">
                  <ItemForm merchantId={merchantId} participationId={participationId} item={item} />
                  <ItemImageForm
                    merchantId={merchantId}
                    participationId={participationId}
                    itemId={item.id}
                    imageUrl={item.imageUrl}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => setEditingId(null)}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <MediaImage
                    src={item.imageUrl}
                    alt={item.name}
                    width={56}
                    height={56}
                    fallback={item.name}
                    className="size-14 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {item.isHalal ? <Badge variant="secondary">Halal</Badge> : null}
                      {item.availability !== "available" ? (
                        <Badge variant="outline">
                          {ITEM_AVAILABILITY_LABELS[item.availability as ItemAvailability] ??
                            item.availability}
                        </Badge>
                      ) : null}
                    </div>
                    {item.price ? (
                      <p className="text-sm">
                        {item.promoPrice ? (
                          <>
                            <span className="font-medium">
                              {formatPrice(item.promoPrice, item.currency)}
                            </span>{" "}
                            <span className="text-muted-foreground line-through">
                              {formatPrice(item.price, item.currency)}
                            </span>
                          </>
                        ) : (
                          formatPrice(item.price, item.currency)
                        )}
                      </p>
                    ) : null}
                    {item.description ? (
                      <p className="text-muted-foreground text-sm">{item.description}</p>
                    ) : null}
                    {item.dietaryTags ? (
                      <p className="text-muted-foreground text-xs">{item.dietaryTags}</p>
                    ) : null}
                  </div>

                  {editable ? (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingId(item.id)}
                      >
                        Edit
                      </Button>
                      <form action={deleteItemAction}>
                        <input type="hidden" name="merchantId" value={merchantId} />
                        <input type="hidden" name="participationId" value={participationId} />
                        <input type="hidden" name="itemId" value={item.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <div className="rounded-lg border border-dashed p-3">
          <p className="mb-3 text-sm font-medium">Add an item</p>
          <ItemForm merchantId={merchantId} participationId={participationId} />
        </div>
      ) : null}
    </div>
  );
}
