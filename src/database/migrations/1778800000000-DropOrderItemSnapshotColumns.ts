import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropOrderItemSnapshotColumns1778800000000 implements MigrationInterface {
  name = 'DropOrderItemSnapshotColumns1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "productName"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "sku"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN IF EXISTS "totalPrice"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "order_items" ADD "totalPrice" numeric(12,2) NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "totalPrice" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD "imageUrl" character varying`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD "sku" character varying NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "sku" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "order_items" ADD "productName" character varying NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "productName" DROP DEFAULT`);
  }
}
