import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCartItemUnitPriceSnapshot1778800001000 implements MigrationInterface {
  name = 'DropCartItemUnitPriceSnapshot1778800001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "unitPriceSnapshot"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cart_items" ADD "unitPriceSnapshot" numeric`);
  }
}
