import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  Query,
  Patch,
  Req,
} from '@nestjs/common';

import { Roles } from '../utils/decorators/roles/roles.decorator';
import { CurrentUser } from '../utils/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../utils/guards/jwt-auth.guard';
import { Role } from '../utils/enums/role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { BrandService } from './brand.service';
import { RegisterBrandDto } from './dto/register-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { RolesGuard } from 'src/utils/guards/roles.guard';

@Controller('brand')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post('register')
  @UseInterceptors(FileInterceptor('logo'))
  registerBrand(
    @Body() dto: RegisterBrandDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.brandService.registerBrand(dto, file);
  }
  @Get(':id/public')
  getPublicBrand(@Param('id') id: string) {
    return this.brandService.getPublicBrand(id);
  }
  @Get()
  getAllBrands(@Query('limit') limit = 10, @Query('cursor') cursor?: string) {
    return this.brandService.getAllBrands(limit, cursor);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMyBrand(@Request() req) {
    return this.brandService.getMyBrand(req.user);
  }

  // 🔐 PROTECTED ROUTE
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.BRAND_OWNER)
  getDashboard(@CurrentUser() user) {
    return this.brandService.getBrandDashboard(user);
  }


  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.BRAND_OWNER)
  @UseInterceptors(FileInterceptor('logo'))
  updateBrand(
    
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
    @UploadedFile() file: Express.Multer.File,
    @Req() req,
  ) {
     console.log('🚀 Controller User:', req.user);
    return this.brandService.updateBrand(id, dto, file, req.user);
  }
}
