/** Result shapes for the visitor actions. Kept out of the "use server" module,
 * which may only export async functions (§9). */

export type FavouriteResult =
  | { ok: true; favourited: boolean }
  | { ok: false; message: string };
