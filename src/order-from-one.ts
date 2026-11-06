import type { Core } from '@strapi/strapi';

/** Types whose `order` used to start at 0. */
const UIDS = ['api::tour.tour', 'api::destination.destination'];

/** Old data (or a fresh seed) starts at 0 or has none; the form now refuses anything below 1. */
export const startsAtZero = (orders: Array<number | null>): boolean => orders.some((order) => !order);

/**
 * The seed (built by the website) numbers from 0, the form wants 1: how much to add to every `order` of one type
 * in it. Zero when the seed already starts at 1, so a regenerated seed is not shifted twice.
 */
export const seedOrderShift = (orders: Array<number | undefined>): number => (startsAtZero(orders.map((order) => order ?? null)) ? 1 : 0);

/**
 * `order` now starts at 1. When a type still has a 0 (or an empty value), moves every row of that type up by one so
 * the lists keep their order. Safe to run on every boot: once nothing is 0 it does nothing. Rows are updated one by
 * one on the database (drafts and published, every language): a language left out would keep the old number.
 */
export async function migrateOrderFromOne(strapi: Core.Strapi) {
  let moved = 0;
  for (const uid of UIDS) {
    const rows: Array<{ id: number; order: number | null }> = await strapi.db.query(uid).findMany({ select: ['id', 'order'] });
    if (!startsAtZero(rows.map((row) => row.order))) continue;
    for (const row of rows) {
      await strapi.db.query(uid).update({ where: { id: row.id }, data: { order: (row.order ?? 0) + 1 } });
      moved++;
    }
  }
  if (moved) strapi.log.info(`[bootstrap] Order from 1: ${moved} row(s) moved up by one`);
}
