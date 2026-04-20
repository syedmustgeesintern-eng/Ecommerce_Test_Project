import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SignupCustomerDto } from '../user/dto/signup-customer.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('signup')
  signupCustomer(@Body() dto: SignupCustomerDto) {
    return this.authService.signupCustomer(dto);
  }
   @Post('verify-otp')
  verifyCustomerOtp(@Body() body: { email: string; otp: string }) {
    return this.authService.verifyCustomerOtp(body.email, body.otp);
  }
}
