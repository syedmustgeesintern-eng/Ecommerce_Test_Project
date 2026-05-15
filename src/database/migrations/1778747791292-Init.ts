import { MigrationInterface, QueryRunner } from "typeorm";

export class Init1778747791292 implements MigrationInterface {
    name = 'Init1778747791292'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parentId"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_cart"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_variant"`);
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_carts_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_slug"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_parentId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_categories_isActive"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_product_reviews_productId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_product_reviews_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cart_items_cartId"`);
        await queryRunner.query(`ALTER TABLE "product_ratings" DROP CONSTRAINT "CHK_product_ratings_average_range"`);
        await queryRunner.query(`ALTER TABLE "product_ratings" DROP CONSTRAINT "CHK_product_ratings_total_non_negative"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP CONSTRAINT "CHK_product_reviews_rating_range"`);
        await queryRunner.query(`CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "productId" uuid, "variantId" uuid, "productName" character varying NOT NULL, "sku" character varying NOT NULL, "imageUrl" character varying, "selectedAttributes" jsonb, "unitPrice" numeric(12,2) NOT NULL, "quantity" integer NOT NULL, "totalPrice" numeric(12,2) NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_order_items_variantId" ON "order_items" ("variantId") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_items_productId" ON "order_items" ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_items_orderId" ON "order_items" ("orderId") `);
        await queryRunner.query(`CREATE TABLE "order_addresses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "fullName" character varying NOT NULL, "phone" character varying NOT NULL, "city" character varying NOT NULL, "addressLine1" character varying NOT NULL, "addressLine2" character varying, "postalCode" character varying NOT NULL, CONSTRAINT "PK_4b8d293512b266903d636106440" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_history_oldstatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_history_newstatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "order_status_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "oldStatus" "public"."order_status_history_oldstatus_enum", "newStatus" "public"."order_status_history_newstatus_enum" NOT NULL, "changedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_e6c66d853f155531985fc4f6ec8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_order_status_history_orderId_changedAt" ON "order_status_history" ("orderId", "changedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_status_history_changedAt" ON "order_status_history" ("changedAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_order_status_history_orderId" ON "order_status_history" ("orderId") `);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')`);
        await queryRunner.query(`CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderNumber" character varying NOT NULL, "userId" uuid NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'PENDING', "subtotal" numeric(12,2) NOT NULL, "shippingFee" numeric(12,2) NOT NULL, "totalAmount" numeric(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "shippingAddressId" uuid, CONSTRAINT "UQ_59b0c3b34ea0fa5562342f24143" UNIQUE ("orderNumber"), CONSTRAINT "REL_cc4e4adab232e8c05026b2f345" UNIQUE ("shippingAddressId"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_orders_userId_createdAt" ON "orders" ("userId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_orders_createdAt" ON "orders" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_orders_userId" ON "orders" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_77d4cad977bd471fb670059561" ON "categories" ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_9a6f051e66982b5f0318981bca" ON "categories" ("parentId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_420d9f679d41281f282f5bc7d0" ON "categories" ("slug") `);
        await queryRunner.query(`CREATE INDEX "IDX_964f13abf796aca25d7e5849c6" ON "product_reviews" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_32edd80d91dff1bc19e79c8f16" ON "product_reviews" ("productId") `);
        await queryRunner.query(`ALTER TABLE "product_ratings" ADD CONSTRAINT "CHK_0fe77054e50ff7dddf25962155" CHECK ("totalRatings" >= 0)`);
        await queryRunner.query(`ALTER TABLE "product_ratings" ADD CONSTRAINT "CHK_4a436042e6d08384113173561c" CHECK ("averageRating" >= 0 AND "averageRating" <= 5)`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD CONSTRAINT "CHK_92a3c62e2d94207664028bc6df" CHECK ("rating" >= 1 AND "rating" <= 5)`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_cdb99c05982d5191ac8465ac010" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_status_history" ADD CONSTRAINT "FK_689db3835e5550e68d26ca32676" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "orders" ADD CONSTRAINT "FK_cc4e4adab232e8c05026b2f345d" FOREIGN KEY ("shippingAddressId") REFERENCES "order_addresses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_edd714311619a5ad09525045838" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_5a27845bc2d79be6f1fa3d2c036" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_69828a178f152f157dcf2f70a89" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "carts" DROP CONSTRAINT "FK_69828a178f152f157dcf2f70a89"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_5a27845bc2d79be6f1fa3d2c036"`);
        await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT "FK_edd714311619a5ad09525045838"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_cc4e4adab232e8c05026b2f345d"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_151b79a83ba240b0cb31b2302d1"`);
        await queryRunner.query(`ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_689db3835e5550e68d26ca32676"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_cdb99c05982d5191ac8465ac010"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`);
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_9a6f051e66982b5f0318981bcaa"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" DROP CONSTRAINT "CHK_92a3c62e2d94207664028bc6df"`);
        await queryRunner.query(`ALTER TABLE "product_ratings" DROP CONSTRAINT "CHK_4a436042e6d08384113173561c"`);
        await queryRunner.query(`ALTER TABLE "product_ratings" DROP CONSTRAINT "CHK_0fe77054e50ff7dddf25962155"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_32edd80d91dff1bc19e79c8f16"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_964f13abf796aca25d7e5849c6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_420d9f679d41281f282f5bc7d0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9a6f051e66982b5f0318981bca"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_77d4cad977bd471fb670059561"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_userId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_createdAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_orders_userId_createdAt"`);
        await queryRunner.query(`DROP TABLE "orders"`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_status_history_orderId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_status_history_changedAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_status_history_orderId_changedAt"`);
        await queryRunner.query(`DROP TABLE "order_status_history"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_history_newstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_history_oldstatus_enum"`);
        await queryRunner.query(`DROP TABLE "order_addresses"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_items_orderId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_items_productId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_items_variantId"`);
        await queryRunner.query(`DROP TABLE "order_items"`);
        await queryRunner.query(`ALTER TABLE "product_reviews" ADD CONSTRAINT "CHK_product_reviews_rating_range" CHECK (((rating >= 1) AND (rating <= 5)))`);
        await queryRunner.query(`ALTER TABLE "product_ratings" ADD CONSTRAINT "CHK_product_ratings_total_non_negative" CHECK (("totalRatings" >= 0))`);
        await queryRunner.query(`ALTER TABLE "product_ratings" ADD CONSTRAINT "CHK_product_ratings_average_range" CHECK ((("averageRating" >= (0)::double precision) AND ("averageRating" <= (5)::double precision)))`);
        await queryRunner.query(`CREATE INDEX "IDX_cart_items_cartId" ON "cart_items" ("cartId") `);
        await queryRunner.query(`CREATE INDEX "IDX_product_reviews_userId" ON "product_reviews" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_product_reviews_productId" ON "product_reviews" ("productId") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_isActive" ON "categories" ("isActive") `);
        await queryRunner.query(`CREATE INDEX "IDX_categories_parentId" ON "categories" ("parentId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_categories_slug" ON "categories" ("slug") `);
        await queryRunner.query(`ALTER TABLE "carts" ADD CONSTRAINT "FK_carts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_cart_items_variant" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "cart_items" ADD CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parentId" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
