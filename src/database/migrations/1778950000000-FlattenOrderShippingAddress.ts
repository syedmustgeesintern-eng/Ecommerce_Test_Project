import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the hybrid (shippingAddressId + shippingAddressOverride) columns
 * with a single, non-nullable JSONB column: shippingAddress.
 *
 * Data-safety guarantee (up):
 *   1. shippingAddress is added as nullable so no existing rows are rejected.
 *   2a. Rows that have shippingAddressOverride → copy it verbatim.
 *   2b. Rows that have only shippingAddressId → JOIN user_addresses and build JSON.
 *   2c. Safety fallback for any remaining nulls (dev / seed data) → empty object.
 *   3. Column is made NOT NULL after all rows are populated.
 *   4. Old FK constraint is dropped.
 *   5. Old columns are dropped.
 *
 * Rollback (down) restores shippingAddressOverride and shippingAddressId,
 * copies the unified snapshot back into shippingAddressOverride, and
 * drops the new shippingAddress column.
 */
export class FlattenOrderShippingAddress1778950000000
  implements MigrationInterface
{
  name = 'FlattenOrderShippingAddress1778950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 1: Add new unified column (nullable for safe data migration) ────
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "shippingAddress" jsonb`,
    );

    // ── Step 2a: Copy existing override snapshots ─────────────────────────────
    await queryRunner.query(`
      UPDATE "orders"
      SET    "shippingAddress" = "shippingAddressOverride"
      WHERE  "shippingAddressOverride" IS NOT NULL
    `);

    // ── Step 2b: For orders with only a saved-address FK, hydrate from the ────
    //            user_addresses table so the snapshot is still complete.
    await queryRunner.query(`
      UPDATE "orders" o
      SET    "shippingAddress" = jsonb_build_object(
               'fullName',      ua."fullName",
               'phoneNumber',   ua."phoneNumber",
               'country',       ua."country",
               'city',          ua."city",
               'state',         ua."state",
               'postalCode',    ua."postalCode",
               'streetAddress', ua."streetAddress",
               'addressLabel',  ua."addressLabel"
             )
      FROM   "user_addresses" ua
      WHERE  o."shippingAddressId" = ua.id
        AND  o."shippingAddressOverride" IS NULL
        AND  o."shippingAddress"   IS NULL
    `);

    // ── Step 2c: Safety net — nulls left over from dev/seed data ─────────────
    await queryRunner.query(`
      UPDATE "orders"
      SET    "shippingAddress" = '{}'::jsonb
      WHERE  "shippingAddress" IS NULL
    `);

    // ── Step 3: Enforce NOT NULL now that every row is populated ──────────────
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "shippingAddress" SET NOT NULL`,
    );

    // ── Step 4: Drop FK constraint ────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_shippingAddressId"`,
    );

    // ── Step 5: Drop old columns ──────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "shippingAddressId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "shippingAddressOverride"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Restore old columns ───────────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "shippingAddressOverride" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "shippingAddressId" uuid`,
    );

    // Copy unified snapshot back into the override column
    await queryRunner.query(`
      UPDATE "orders"
      SET    "shippingAddressOverride" = "shippingAddress"
      WHERE  "shippingAddress" IS NOT NULL
    `);

    // Restore FK (rows will have NULL shippingAddressId — that is correct
    // because the link to user_addresses no longer exists in the snapshot)
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_shippingAddressId"
        FOREIGN KEY ("shippingAddressId")
        REFERENCES  "user_addresses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // Drop the unified column
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "shippingAddress"`,
    );
  }
}
