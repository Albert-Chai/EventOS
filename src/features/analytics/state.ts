/**
 * Shared types for the analytics feature. Kept out of the `"use server"` action
 * file, which may export only async functions (spec §9).
 */

/** What a QR-panel action returns to its client component. */
export type QrPanelResult =
  | {
      ok: true;
      shortCode: string;
      url: string;
      dataUri: string;
      scanCount: number;
      targetPath: string;
    }
  | { ok: false; message: string };
