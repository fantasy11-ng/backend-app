import { MainConfig } from '@/common/config/main.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    configService: ConfigService<MainConfig>,
    private readonly usersService: UsersService,
  ) {
    const googleConfig = configService.get('auth.google', { infer: true });

    super({
      clientID: googleConfig?.clientID,
      clientSecret: googleConfig?.clientSecret,
      callbackURL: googleConfig?.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    const email = profile.emails?.[0]?.value || profile._json?.email || '';
    if (!email) {
      throw new Error('Email is required but not provided by Google OAuth');
    }
    const user = await this.usersService.findByGoogleIdOrCreateUser({
      email,
      phone: '',
      fullName: profile.displayName || profile.name?.givenName || '',
      googleId: profile.id,
    });
    return user;
  }
}
