import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from 'src/utils/guards/jwt-auth.guard';
import type { JwtUser } from 'src/utils/types/jwt-user.type';
import { CurrentUser } from 'src/utils/decorators/current-user/current-user.decorator';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@Request() req) {
    return this.userService.getMe(req.user);
  }
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: JwtUser, @Body() dto: UpdateUserDto) {
    return this.userService.updateUserInfo(user.userId, dto);
  }
  @Get()
  getAllUsers(@Query('limit') limit = 10, @Query('cursor') cursor?: string) {
    return this.userService.getAllUsers(limit, cursor);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(+id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(+id);
  }
}
