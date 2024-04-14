import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { RefreshToken } from '@/modules/auth/entities/refresh-token';
import { MainConfig } from 'src/common/config/main.config';
import { Repository } from 'typeorm';

@Injectable()
export class RefreshTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<MainConfig>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async create({ userId }: { userId: string }) {
    const authConfig = this.configService.get('auth', { infer: true });
    const refreshToken = new RefreshToken();
    refreshToken.userId = userId;
    refreshToken.expires = new Date(
      Date.now() + authConfig.refreshToken.expiresIn * 1000,
    );

    this.refreshTokenRepo.save(refreshToken);

    const token = await this.jwtService.signAsync(
      { sub: refreshToken.id, userId: refreshToken.userId },
      {
        secret: authConfig.jwt.secret,
        expiresIn: authConfig.refreshToken.expiresIn,
      },
    );
    return token;
  }

  async validate(token: string) {
    let payload: { sub: number; userId: string };
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new BadRequestException('Invalid refresh token');
    }

    const refreshToken = await this.refreshTokenRepo.findOneBy({
      id: payload.sub,
    });
    if (
      !refreshToken ||
      refreshToken.expires < new Date() ||
      refreshToken.revokedAt
    ) {
      return null;
    }

    return refreshToken;
  }

  async revoke(token: string) {
    let payload: { sub: number; userId: string };
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new BadRequestException('Invalid refresh token');
    }

    const refreshToken = await this.refreshTokenRepo.findOneBy({
      id: payload.sub,
    });
    if (!refreshToken) {
      throw new BadRequestException('Invalid refresh token');
    }
    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepo.save(refreshToken);
  }

  async findByUserId(userId: string) {
    return this.refreshTokenRepo.findOneBy({ userId });
  }

  async findTokenByUserIdOrCreate(userId: string) {
    const authConfig = this.configService.get('auth', { infer: true });

    const refreshToken = await this.findByUserId(userId);
    let token: string;
    if (refreshToken) {
      token = await this.jwtService.signAsync(
        { sub: refreshToken.id, userId: refreshToken.userId },
        {
          secret: authConfig.jwt.secret,
          expiresIn: refreshToken.expires.getTime() / 1000,
        },
      );
    } else {
      token = await this.create({ userId });
    }

    return token;
  }
}
