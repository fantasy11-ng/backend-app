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
    const user = await this.usersService.findByGoogleIdOrCreateUser({
      email: profile.email,
      phone: '',
      fullName: profile.displayName,
      googleId: profile.id,
    });
    return user;
  }
}
