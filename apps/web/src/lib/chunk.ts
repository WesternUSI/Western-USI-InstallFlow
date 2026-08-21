/**
 * Rows per mutation call when applying an uploaded file.
 *
 * A Convex mutation is one transaction with a bounded number of reads and
 * writes, and each row here costs one index read plus one write. A full Site
 * Database is ~800 rows, so it is split rather than pushed in a single call.
 */
export const UPLOAD_BATCH_SIZE = 200;

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
