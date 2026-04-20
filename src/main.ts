import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { RolesGuard } from './utils/guards/roles/roles.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
    app.useGlobalGuards(new RolesGuard(reflector));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
