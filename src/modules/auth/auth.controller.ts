import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { SignUpDto, signUpDtoSchema } from './dto/sign-up.dto';
import { Request } from 'express';
import { User } from '@/modules/users/entities/user.entity';
import {
  RefreshAccessTokenDto,
  refreshAccessTokenDtoSchema,
} from './dto/refresh-access.dto';
import { PasswordService } from './services/password/password.service';
import {
  ResetPasswordDto,
  resetPasswordDtoSchema,
} from './dto/reset-password.dto';
import { SchemaValidator } from '@/common/validators/schema.validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post('signup')
  async signUp(
    @Body(new SchemaValidator(signUpDtoSchema)) signUpDto: SignUpDto,
  ) {
    return this.authService.signUp(signUpDto);
  }

  @Post('signin')
  @UseGuards(LocalAuthGuard)
  signIn(@Req() req: Request) {
    return this.authService.signIn(req['user'] as User);
  }

  @Post('signout')
  @UseGuards(JwtAuthGuard)
  signOut(@Body('refreshToken') refreshToken: string) {
    return this.authService.signOut(refreshToken);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  signInUsingGoogle() {
    return 'Redirecting to google';
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallabck(@Req() req: Request) {
    return this.authService.signIn(req['user'] as User);
  }

  @Post('refresh')
  refresh(
    @Body(new SchemaValidator(refreshAccessTokenDtoSchema))
    refreshAccessTokenDto: RefreshAccessTokenDto,
  ) {
    return this.authService.refresh(refreshAccessTokenDto.refreshToken);
  }

  @Post('password/request')
  resetPassword(@Body('email') email: string) {
    return this.passwordService.requestPasswordReset(email);
  }

  @Post('password/reset')
  @UseGuards(JwtAuthGuard)
  resetPasswordConfirm(
    @Body(new SchemaValidator(resetPasswordDtoSchema))
    resetPasswordDto: ResetPasswordDto,
  ) {
    return this.passwordService.resetPassword(resetPasswordDto);
  }
}
