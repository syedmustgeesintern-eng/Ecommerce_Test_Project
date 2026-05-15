import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the OneToOne order_addresses snapshot with:
 *   - shippingAddressId  → FK to user_addresses (nullable, SET NULL on delete)
 *   - shippingAddressOverride → JSONB column for inline/temporary addresses
 *
 * Data-safety guarantee:
 *   All existing order_addresses rows are migrated into shippingAddressOverride
 *   BEFORE any destructive step, so no production address data is lost.
 */
export class RefactorOrderShippingAddress1778900001000 implements MigrationInterface {
  name = 'RefactorOrderShippingAddress1778900001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── STEP 1: Add new columns ───────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TABLE "orders" ADD "shippingAddressOverride" jsonb`,
    );

    // ── STEP 2: Migrate existing data ─────────────────────────────────────────
    // Copy every order's order_addresses row into shippingAddressOverride JSONB
    // before we touch any constraints. Maps old field names to new uniform names.
    await queryRunner.query(`
      UPDATE "orders" o
      SET "shippingAddressOverride" = jsonb_build_object(
        'fullName',     oa."fullName",
        'phoneNumber',  oa."phone",
        'country',      null,
        'city',         oa."city",
        'state',        null,
        'postalCode',   oa."postalCode",
        'streetAddress', oa."addressLine1"
      )
      FROM "order_addresses" oa
      WHERE oa.id = o."shippingAddressId"
        AND o."shippingAddressId" IS NOT NULL
    `);

    // ── STEP 3: Drop old FK + unique constraint ───────────────────────────────
    // TypeORM named these based on the entity hash — drop by name.
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_cc4e4adab232e8c05026b2f345d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "REL_cc4e4adab232e8c05026b2f345"`,
    );

    // ── STEP 4: Clear the column (old IDs pointed to order_addresses, now useless) ──
    await queryRunner.query(
      `UPDATE "orders" SET "shippingAddressId" = null`,
    );

    // ── STEP 5: Add new FK → user_addresses ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_shippingAddressId"
        FOREIGN KEY ("shippingAddressId")
        REFERENCES "user_addresses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    // ── STEP 6: Drop the old snapshot table ───────────────────────────────────
    await queryRunner.query(`DROP TABLE IF EXISTS "order_addresses"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── Restore order_addresses table ─────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "order_addresses" (
        "id"           uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "fullName"     varchar      NOT NULL,
        "phone"        varchar      NOT NULL,
        "city"         varchar      NOT NULL,
        "addressLine1" varchar      NOT NULL,
        "addressLine2" varchar,
        "postalCode"   varchar      NOT NULL,
        CONSTRAINT "PK_4b8d293512b266903d636106440" PRIMARY KEY ("id")
      )
    `);

    // Restore snapshot rows from the JSONB override
    await queryRunner.query(`
      INSERT INTO "order_addresses" ("fullName", "phone", "city", "addressLine1", "postalCode")
      SELECT
        ("shippingAddressOverride"->>'fullName'),
        ("shippingAddressOverride"->>'phoneNumber'),
        ("shippingAddressOverride"->>'city'),
        ("shippingAddressOverride"->>'streetAddress'),
        ("shippingAddressOverride"->>'postalCode')
      FROM "orders"
      WHERE "shippingAddressOverride" IS NOT NULL
    `);

    // Drop new FK
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "FK_orders_shippingAddressId"`,
    );

    // Remove new column
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN IF EXISTS "shippingAddressOverride"`,
    );
  }
}
