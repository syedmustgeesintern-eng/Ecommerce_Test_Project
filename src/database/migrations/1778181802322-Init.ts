import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1778181802322 implements MigrationInterface {
  name = 'Init1778181802322';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasSlug = await queryRunner.hasColumn('categories', 'slug');
    const hasParentId = await queryRunner.hasColumn('categories', 'parentId');
    const hasLevel = await queryRunner.hasColumn('categories', 'level');
    const hasIsActive = await queryRunner.hasColumn('categories', 'isActive');
    const hasDeletedAt = await queryRunner.hasColumn('categories', 'deletedAt');

    if (!hasSlug) {
      await queryRunner.query(
        `ALTER TABLE "categories" ADD "slug" character varying`,
      );
    }

    if (!hasParentId) {
      await queryRunner.query(`ALTER TABLE "categories" ADD "parentId" uuid`);
    }

    if (!hasLevel) {
      await queryRunner.query(
        `ALTER TABLE "categories" ADD "level" integer NOT NULL DEFAULT '0'`,
      );
    }

    if (!hasIsActive) {
      await queryRunner.query(
        `ALTER TABLE "categories" ADD "isActive" boolean NOT NULL DEFAULT true`,
      );
    }

    if (!hasDeletedAt) {
      await queryRunner.query(
        `ALTER TABLE "categories" ADD "deletedAt" TIMESTAMP`,
      );
    }

    await queryRunner.query(`
      UPDATE "categories"
      SET "slug" = CONCAT(
        COALESCE(
          NULLIF(
            TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')),
            ''
          ),
          'category'
        ),
        '-',
        SUBSTRING("id"::text, 1, 8)
      )
      WHERE "slug" IS NULL OR TRIM("slug") = ''
    `);

    await queryRunner.query(
      `ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_categories_slug" ON "categories" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_categories_parentId" ON "categories" ("parentId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_categories_isActive" ON "categories" ("isActive")`,
    );
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_categories_parentId'
        ) THEN
          ALTER TABLE "categories"
          ADD CONSTRAINT "FK_categories_parentId"
          FOREIGN KEY ("parentId")
          REFERENCES "categories"("id")
          ON DELETE SET NULL
          ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT IF EXISTS "FK_categories_parentId"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_categories_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_categories_parentId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_categories_slug"`);

    if (await queryRunner.hasColumn('categories', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "deletedAt"`);
    }

    if (await queryRunner.hasColumn('categories', 'isActive')) {
      await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "isActive"`);
    }

    if (await queryRunner.hasColumn('categories', 'level')) {
      await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "level"`);
    }

    if (await queryRunner.hasColumn('categories', 'parentId')) {
      await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "parentId"`);
    }

    if (await queryRunner.hasColumn('categories', 'slug')) {
      await queryRunner.query(`ALTER TABLE "categories" DROP COLUMN "slug"`);
    }
  }
}
