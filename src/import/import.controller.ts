import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from 'src/utils/guards/jwt-auth.guard';
import { CurrentUser } from 'src/utils/decorators/current-user/current-user.decorator';
import type { JwtUser } from 'src/utils/types/jwt-user.type';

@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('products')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadProductsCsv(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtUser,
  ) {
    return this.importService.queueProductsCsvImport(file, user.userId);
  }

  @Get('products/:id')
  @UseGuards(JwtAuthGuard)
  getProductsImportStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.importService.getProductsImportStatus(id, user.userId);
  }
}
