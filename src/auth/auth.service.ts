import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import * as bcrypt from 'bcrypt';
import { SignUpDto } from './dto/sign-up.dto';
import { User } from 'src/users/entities/user.entity';
import { RefreshTokenService } from './services/refresh-token/refresh-token.service';
import { EmailService } from 'src/common/email/email.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly emailService: EmailService,
  ) {}

  async signUp(signUpDto: SignUpDto) {
    const user = new User();
    user.fullName = signUpDto.fullName;
    user.email = signUpDto.email;
    user.phone = signUpDto.phone;
    user.password = await bcrypt.hash(signUpDto.password, 12);

    return await this.usersService.create(user);
  }

  async signIn(user: User) {
    const refreshToken =
      await this.refreshTokenService.findTokenByUserIdOrCreate(user.id);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      user: {
        id: user.id,
        name: user.fullName,
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
      },
      accessToken,
      refreshToken,
    };
  }

  async signOut(refreshToken: string) {
    await this.refreshTokenService.revoke(refreshToken);
  }

  async validate(email: string, password: string) {
    const user = await this.usersService.findOne({ email });
    if (!user?.password) {
      return null;
    }
    if (user && (await bcrypt.compare(password, user.password))) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, ...payload } = user;
      return payload;
    }

    return null;
  }

  async refresh(refreshToken: string) {
    const refreshTokenEntity =
      await this.refreshTokenService.validate(refreshToken);
    if (!refreshTokenEntity) {
      throw new BadRequestException('Invalid refresh token');
    }

    const user = await this.usersService.findOne({
      id: refreshTokenEntity.userId,
    });
    if (!user) {
      throw new BadRequestException('Invalid refresh token');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
    };
  }
}
