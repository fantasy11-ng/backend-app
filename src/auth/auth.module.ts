import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from 'src/users/users.module';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStartegy } from './strategies/jwt.startegy';
import { GoogleStrategy } from './strategies/google.strategy';
import { RefreshTokenService } from './services/refresh-token/refresh-token.service';
import { ConfigService } from '@nestjs/config';
import { MainConfig } from 'src/common/config/main.config';
import { PasswordService } from './services/password/password.service';
import { CommonModule } from 'src/common/common.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token';

@Module({
  imports: [
    UsersModule,
    CommonModule,
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<MainConfig>) => {
        const authConfig = configService.get('auth', { infer: true });
        return {
          global: true,
          secret: authConfig?.jwt.secret,
          signOptions: { expiresIn: authConfig.jwt.expiresIn },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    LocalStrategy,
    JwtStartegy,
    GoogleStrategy,
    RefreshTokenService,
    PasswordService,
  ],
  controllers: [AuthController],
})
export class AuthModule {}
