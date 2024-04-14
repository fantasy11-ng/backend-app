import { MainConfig } from '@/common/config/main.config';
import { UsersService } from '@/modules/users/users.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStartegy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService<MainConfig>,
    private readonly usersService: UsersService,
  ) {
    const jwtConfig = configService.get('auth.jwt', { infer: true });

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: jwtConfig.secret,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...user } = await this.usersService.findOne({
      id: payload.userId,
    });
    return user;
  }
}
