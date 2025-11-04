import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { FacebookAuthGuard } from './guards/facebook-auth.guard';
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
  ResetPasswordRequestDto,
  resetPasswordRequestDtoSchema,
} from './dto/reset-password.dto';
import { SchemaValidator } from '@/common/validators/schema.validator';
import { SignInDto } from './dto/sign-in.dto';
import {
  AccessTokenResponse,
  MessageResponse,
  SignInResponse,
} from './dto/auth.responses';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordService: PasswordService,
  ) {}

  @Post('signup')
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiOkResponse({ type: MessageResponse })
  async signUp(
    @Body(new SchemaValidator(signUpDtoSchema)) signUpDto: SignUpDto,
  ) {
    return this.authService.signUp(signUpDto);
  }

  @Post('signin')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ type: SignInDto })
  @ApiOkResponse({ type: SignInResponse })
  signIn(@Req() req: Request) {
    return this.authService.signIn(req['user'] as User);
  }

  @Post('signout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out and revoke refresh token' })
  @ApiOkResponse({ type: MessageResponse })
  signOut(@Body('refreshToken') refreshToken: string) {
    return this.authService.signOut(refreshToken);
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Initiate Google OAuth flow' })
  signInUsingGoogle() {
    return 'Redirecting to google';
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiOkResponse({ type: SignInResponse })
  googleCallabck(@Req() req: Request) {
    return this.authService.signIn(req['user'] as User);
  }

  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  @ApiOperation({ summary: 'Initiate Facebook OAuth flow' })
  signInUsingFacebook() {
    return 'Redirecting to facebook';
  }

  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  @ApiOperation({ summary: 'Facebook OAuth callback' })
  @ApiOkResponse({ type: SignInResponse })
  facebookCallback(@Req() req: Request) {
    return this.authService.signIn(req['user'] as User);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiOkResponse({ type: AccessTokenResponse })
  refresh(
    @Body(new SchemaValidator(refreshAccessTokenDtoSchema))
    refreshAccessTokenDto: RefreshAccessTokenDto,
  ) {
    return this.authService.refresh(refreshAccessTokenDto.refreshToken);
  }

  @Post('password/request')
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiOkResponse({ type: MessageResponse })
  @ApiBody({ type: ResetPasswordRequestDto })
  resetPassword(
    @Body(new SchemaValidator(resetPasswordRequestDtoSchema))
    resetPasswordRequestDto: ResetPasswordRequestDto,
  ) {
    return this.passwordService.requestPasswordReset(
      resetPasswordRequestDto.email,
    );
  }

  @Post('password/reset')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset password using reset token' })
  @ApiOkResponse({ type: MessageResponse })
  @ApiBody({ type: ResetPasswordDto })
  resetPasswordConfirm(
    @Body(new SchemaValidator(resetPasswordDtoSchema))
    resetPasswordDto: ResetPasswordDto,
  ) {
    return this.passwordService.resetPassword(resetPasswordDto);
  }
}
