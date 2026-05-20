import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingFeeToBrands1779000000000 implements MigrationInterface {
  name = 'AddShippingFeeToBrands1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brands" ADD COLUMN "shippingFee" DECIMAL(12,2) NOT NULL DEFAULT 0.00`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "brands" DROP COLUMN "shippingFee"`,
    );
  }
}
