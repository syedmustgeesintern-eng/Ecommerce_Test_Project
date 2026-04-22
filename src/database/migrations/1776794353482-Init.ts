import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1776794353482 implements MigrationInterface {
    name = 'Init1776794353482'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brands" ALTER COLUMN "logo_url" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "brands" ALTER COLUMN "support_email" DROP NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "brands" ALTER COLUMN "support_email" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "brands" ALTER COLUMN "logo_url" SET NOT NULL`);
    }

}
