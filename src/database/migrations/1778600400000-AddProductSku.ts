import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSku1778600400000 implements MigrationInterface {
  name = 'AddProductSku1778600400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "sku" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "sku"`);
  }
}
