import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
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
//import { FacebookAuthGuard } from './guards/facebook-auth.guard';
import { SignUpDto, signUpDtoSchema } from './dto/sign-up.dto';
import { Request, Response } from 'express';
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
import { ConfigService } from '@nestjs/config';
import { MainConfig } from '@/common/config/main.config';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordService: PasswordService,
    private readonly configService: ConfigService<MainConfig>,
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
  async googleCallabck(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.signIn(req['user'] as User);

    const clientConfig = this.configService.get('client', { infer: true });
    const clientBaseUrl =
      (clientConfig && clientConfig.url) || process.env.CLIENT_URL || '';

    // Fallback to localhost if CLIENT_URL is not configured
    const base =
      clientBaseUrl && clientBaseUrl.length > 0
        ? clientBaseUrl
        : 'http://localhost:5173';

    const redirectUrl = new URL(
      '/auth/google/callback',
      base.endsWith('/') ? base : `${base}/`,
    );

    redirectUrl.searchParams.set('accessToken', result.accessToken);
    redirectUrl.searchParams.set('refreshToken', result.refreshToken);
    redirectUrl.searchParams.set('userId', result.user.id);
    redirectUrl.searchParams.set('email', result.user.email);
    redirectUrl.searchParams.set('role', result.user.role);

    return res.redirect(redirectUrl.toString());
  }

  //@Get('facebook')
  //@UseGuards(FacebookAuthGuard)
  //@ApiOperation({ summary: 'Initiate Facebook OAuth flow' })
  //signInUsingFacebook() {
  //  return 'Redirecting to facebook';
  //}

  //@Get('facebook/callback')
  //@UseGuards(FacebookAuthGuard)
  //@ApiOperation({ summary: 'Facebook OAuth callback' })
  //@ApiOkResponse({ type: SignInResponse })
  //facebookCallback(@Req() req: Request) {
  //  return this.authService.signIn(req['user'] as User);
  //}

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
