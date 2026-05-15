import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAddresses1778900000000 implements MigrationInterface {
  name = 'CreateUserAddresses1778900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create user_addresses table
    await queryRunner.query(`
      CREATE TABLE "user_addresses" (
        "id"            uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"        uuid          NOT NULL,
        "fullName"      varchar(200)  NOT NULL,
        "phoneNumber"   varchar(32)   NOT NULL,
        "country"       varchar(100)  NOT NULL,
        "city"          varchar(120)  NOT NULL,
        "state"         varchar(120),
        "postalCode"    varchar(32)   NOT NULL,
        "streetAddress" varchar(255)  NOT NULL,
        "addressLabel"  varchar(50),
        "isDefault"     boolean       NOT NULL DEFAULT false,
        "createdAt"     TIMESTAMP     NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_addresses" PRIMARY KEY ("id")
      )
    `);

    // 2. FK: user_addresses.userId → users.id (cascade delete so addresses are removed with user)
    await queryRunner.query(`
      ALTER TABLE "user_addresses"
        ADD CONSTRAINT "FK_user_addresses_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // 3. Performance indexes
    await queryRunner.query(
      `CREATE INDEX "IDX_user_addresses_userId" ON "user_addresses" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_addresses_userId_isDefault" ON "user_addresses" ("userId", "isDefault")`,
    );

    // 4. Add defaultAddressId to users (nullable — not every user has an address yet)
    await queryRunner.query(
      `ALTER TABLE "users" ADD "defaultAddressId" uuid`,
    );

    // 5. FK: users.defaultAddressId → user_addresses.id (SET NULL so deleting the default address doesn't orphan the user row)
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD CONSTRAINT "FK_users_defaultAddressId"
        FOREIGN KEY ("defaultAddressId") REFERENCES "user_addresses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_defaultAddressId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "defaultAddressId"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_addresses_userId_isDefault"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_addresses_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_addresses" DROP CONSTRAINT "FK_user_addresses_userId"`,
    );
    await queryRunner.query(`DROP TABLE "user_addresses"`);
  }
}
