import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ProductService } from './product.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Controller('products')
export class ProductController {
  constructor(private productService: ProductService) {}
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'image', maxCount: 10 },
    ]),
  )
  create(
    @UploadedFiles()
    uploaded: {
      images?: Express.Multer.File[];
      image?: Express.Multer.File[];
    },
    @Body('data') data: string,
    @Req() req: any,
  ) {
    let dto: CreateProductDto;
    try {
      dto = JSON.parse(data);
    } catch {
      throw new BadRequestException('Invalid JSON in `data` field');
    }

    const files = [...(uploaded?.images ?? []), ...(uploaded?.image ?? [])];

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

  @Get(':id')
  getProductById(@Param('id') id: string) {
    return this.productService.getProductById(id);
  }

  @Patch(':id')
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'images', maxCount: 10 },
      { name: 'image', maxCount: 10 },
    ]),
  )
  update(
    @Param('id') id: string,
    @UploadedFiles()
    uploaded: {
      images?: Express.Multer.File[];
      image?: Express.Multer.File[];
    },
    @Body() body: Record<string, any>,
    @Req() req: any,
  ) {
    const files = [...(uploaded?.images ?? []), ...(uploaded?.image ?? [])];

    let dto: UpdateProductDto;
    if (typeof body?.data === 'string') {
      try {
        dto = JSON.parse(body.data) as UpdateProductDto;
      } catch {
        throw new BadRequestException('Invalid JSON in `data` field');
      }
    } else {
      dto = body as UpdateProductDto;
    }

    return this.productService.updateProduct(id, dto, files, req.user.brandId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  remove(@Param('id') id: string, @Req() req: any) {
    return this.productService.deleteProduct(id, req.user.brandId);
  }
}
