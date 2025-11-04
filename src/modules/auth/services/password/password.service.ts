import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ResetPasswordDto } from '@/modules/auth/dto/reset-password.dto';
import { EmailService } from 'src/common/email/email.service';
import { UsersService } from '@/modules/users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordService {
  constructor(
    private readonly emailService: EmailService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async requestPasswordReset(email: string) {
    const message =
      'You will receive a password reset email soon. Follow the link in your email to reset your password.';

    const user = await this.usersService.findOne({ email });
    if (!user) {
      return {
        message,
      };
    }

    const token = await this.jwtService.signAsync(
      { sub: user.id },
      { expiresIn: '1h' },
    );

    await this.emailService.sendPasswordReset({
      name: user.fullName || user.email,
      email: user.email,
      token,
    });

    return {
      message,
    };
  }

  async verifyPasswordResetToken(token: string) {
    let payload: { sub: string };
    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new BadRequestException('Invalid token');
    }

    const user = await this.usersService.findOne({ id: payload.sub });
    if (!user) {
      throw new BadRequestException('Invalid token');
    }

    return user;
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.verifyPasswordResetToken(resetPasswordDto.token);
    if (!user) {
      throw new BadRequestException('Invalid user');
    }

    user.password = bcrypt.hashSync(resetPasswordDto.password, 12);
    await this.usersService.update(user.id, user);

    return {
      message: 'Password reset successfully',
    };
  }
}
