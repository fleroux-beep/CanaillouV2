/**
 * verify-schema.ts — Build-time check that ensure-schema.ts is in sync with schema.ts.
 *
 * This script reads the Drizzle schema (shared/schema.ts) and the raw SQL schema
 * (server/ensure-schema.ts) and verifies that every table and column defined in
 * the Drizzle schema has a corresponding entry in ensure-schema.ts.
 *
 * Run: npx tsx scripts/verify-schema.ts
 *
 * This eliminates the "double source of truth" problem (C4.3/M3.8) by failing
 * the build if the two files drift apart.
 */
import * as schema from "../shared/schema";
import { getTableName, getTableColumns } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

const ensureSchemaSql = readFileSync(
  join(import.meta.dirname, "..", "server", "ensure-schema.ts"),
  "utf-8"
);

// Normalize SQL for comparison: lowercase, collapse whitespace
const sqlNorm = ensureSchemaSql.toLowerCase().replace(/\s+/g, " ");

const errors: string[] = [];
const warnings: string[] = [];
let tableCount = 0;
let columnCount = 0;

// Extract all pgTable exports from the schema module
const tables: [string, any][] = [];
for (const [key, val] of Object.entries(schema)) {
  if (!val || typeof val !== "object") continue;
  try {
    const name = getTableName(val as any);
    if (name) tables.push([key, val]);
  } catch {
    // Not a table (relation, type, etc.) — skip
  }
}

for (const [exportName, tableObj] of tables) {
  try {
    const tableName = getTableName(tableObj as any);
    if (!tableName) continue;

    tableCount++;

    // Check table exists in ensure-schema.ts
    if (!sqlNorm.includes(`"${tableName}"`)) {
      errors.push(`TABLE MISSING: "${tableName}" (export: ${exportName}) not found in ensure-schema.ts`);
      continue;
    }

    // Check each column
    const columns = getTableColumns(tableObj as any);
    for (const [colKey, colDef] of Object.entries(columns)) {
      const colName = (colDef as any).name;
      if (!colName) continue;
      columnCount++;

      // Check column exists in ensure-schema.ts (in context of this table)
      // We look for the column name in quotes anywhere in the file
      if (!sqlNorm.includes(`"${colName}"`)) {
        errors.push(`COLUMN MISSING: "${tableName}"."${colName}" (key: ${colKey}) not found in ensure-schema.ts`);
      }
    }
  } catch {
    // Skip non-table exports (relations, etc.)
  }
}

// Report
console.log(`\n=== Schema Verification ===`);
console.log(`Tables checked: ${tableCount}`);
console.log(`Columns checked: ${columnCount}`);

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach((w) => console.log(`  ⚠ ${w}`));
}

if (errors.length > 0) {
  console.log(`\nErrors (${errors.length}):`);
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log(
    `\n❌ Schema drift detected! Update server/ensure-schema.ts to match shared/schema.ts.`
  );
  process.exit(1);
} else {
  console.log(`\n✓ All tables and columns in schema.ts are present in ensure-schema.ts.`);
  process.exit(0);
}
