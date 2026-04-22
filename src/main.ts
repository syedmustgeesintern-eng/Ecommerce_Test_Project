import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true, // allow all (dev only)
    credentials: true,
  });
  //  app.useGlobalGuards(
  //   new JwtAuthGuard(),
  //   new RolesGuard(reflector),
  // );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
