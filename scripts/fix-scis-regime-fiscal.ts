/**
 * One-off migration: set regime_fiscal = 'IS' for all SCIs that currently have it null.
 * All SCIs in this portfolio are IS régime (confirmed by seed data and source Excel).
 */
import { db } from "../server/db";
import { scis } from "../shared/schema";
import { isNull } from "drizzle-orm";

async function main() {
  const result = await db
    .update(scis)
    .set({ regimeFiscal: "IS" })
    .where(isNull(scis.regimeFiscal));

  console.log("✅ Updated SCIs: regime_fiscal set to 'IS' where null");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
