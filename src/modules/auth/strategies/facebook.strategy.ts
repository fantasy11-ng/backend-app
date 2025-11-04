import { MainConfig } from '@/common/config/main.config';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-facebook';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(
    configService: ConfigService<MainConfig>,
    private readonly usersService: UsersService,
  ) {
    const fbConfig = configService.get('auth.facebook', { infer: true });
    super({
      clientID: fbConfig?.clientID,
      clientSecret: fbConfig?.clientSecret,
      callbackURL: fbConfig?.callbackUrl,
      profileFields: ['id', 'displayName', 'emails'],
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value || '';
    const user = await this.usersService.findByFacebookIdOrCreateUser({
      email,
      phone: '',
      fullName: profile.displayName || '',
      facebookId: profile.id,
    });
    return user;
  }
}
