import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1777996292091 implements MigrationInterface {
    name = 'Init1777996292091'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."import_jobs_status_enum" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL_SUCCESS')`);
        await queryRunner.query(`CREATE TABLE "import_jobs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL, "fileKey" character varying NOT NULL, "status" "public"."import_jobs_status_enum" NOT NULL DEFAULT 'QUEUED', "totalRows" integer NOT NULL DEFAULT '0', "successRows" integer NOT NULL DEFAULT '0', "failedRows" integer NOT NULL DEFAULT '0', "failedRowsData" jsonb NOT NULL DEFAULT '[]', "errorFileKey" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4d206c602f173f98e4bb85819a3" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "import_jobs"`);
        await queryRunner.query(`DROP TYPE "public"."import_jobs_status_enum"`);
    }

}
