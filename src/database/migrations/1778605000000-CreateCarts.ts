import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCarts1778605000000 implements MigrationInterface {
  name = 'CreateCarts1778605000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_userId" UNIQUE ("userId")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cartId" uuid NOT NULL,
        "variantId" uuid NOT NULL,
        "quantity" integer NOT NULL,
        "unitPriceSnapshot" numeric,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cart_items_cart_variant" UNIQUE ("cartId", "variantId")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "carts"
      ADD CONSTRAINT "FK_carts_user"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD CONSTRAINT "FK_cart_items_cart"
      FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
      ADD CONSTRAINT "FK_cart_items_variant"
      FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_cart_items_cartId" ON "cart_items" ("cartId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_cartId"`);
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_variant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_cart"`,
    );
    await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_carts_user"`);
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(`DROP TABLE "carts"`);
  }
}
