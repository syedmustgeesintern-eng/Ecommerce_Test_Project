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
  Query
} from '@nestjs/common';

import { Roles } from '../../utils/decorators/roles/roles.decorator';
import { CurrentUser } from '../../utils/decorators/current-user/current-user.decorator';
import { JwtAuthGuard } from '../../utils/guards/jwt-auth.guard';
import { Role } from '../../utils/enums/role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { BrandService } from './brand.service';
import { RegisterBrandDto } from './dto/register-brand.dto';


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
getAllBrands(
  @Query('limit') limit = 10,
  @Query('cursor') cursor?: string,
) {
  return this.brandService.getAllBrands(limit, cursor);
}


@UseGuards(JwtAuthGuard)
@Get('me')
getMyBrand(@Request() req) {
  return this.brandService.getMyBrand(req.user);
}

  

  @Post('verify-otp')
  verifyOtp(@Body() body: { email: string; otp: string }) {
    return this.brandService.verifyOtp(body.email, body.otp);
  }

  // 🔐 PROTECTED ROUTE
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  @Roles(Role.BRAND_OWNER)
  getDashboard(@CurrentUser() user) {
    return this.brandService.getBrandDashboard(user);
  }
}
