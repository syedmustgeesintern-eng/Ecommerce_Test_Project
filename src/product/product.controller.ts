import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductService } from './product.service';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CreateProductDto } from './dto/create-product.dto';

@Controller('products')
export class ProductController {
  constructor(private productService: ProductService) {}
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FilesInterceptor('images'))
  create(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('data') data: string,
    @Req() req: any,
  ) {
    const dto: CreateProductDto = JSON.parse(data);

    return this.productService.createProduct(dto, files, req.user.brandId);
  }

  @Get('my')
  @UseGuards(AuthGuard('jwt'))
  getMyProducts(@Req() req: any) {
    return this.productService.getMyProducts(req.user.brandId);
  }
  @Get()
  getAllProducts(
    @Query('limit') limit: number,
    @Query('cursor') cursor?: string,
  ) {
    return this.productService.getAllProducts(limit, cursor);
  }
}
