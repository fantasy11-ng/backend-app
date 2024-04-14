import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { AuthConfiguration } from 'src/common/config/auth-configuration';
import { UsersService } from '@/modules/users/users.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService<AuthConfiguration>,
    private readonly usersService: UsersService,
  ) {
    const googleConfig = configService.get('google', { infer: true });
    console.log(googleConfig);
    super({
      clientID: googleConfig?.clientID,
      clientSecret: googleConfig?.clientSecret,
      callbackURL: googleConfig?.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: {
      id: string;
      emails: { value: string; verified: boolean }[];
      displayName: string;
    },
  ) {
    const user = await this.usersService.findByGoogleIdOrCreateUser({
      email: profile.emails[0].value,
      phone: '',
      fullName: profile.displayName,
      googleId: profile.id,
    });
    return user;
  }
}
