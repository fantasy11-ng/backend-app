import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { render } from '@react-email/components';
import { Resend } from 'resend';
import { MainConfig } from '../config/main.config';
import { EmailVerificationEmail } from './templates/email-verification';
import { PasswordResetEmail } from './templates/password-reset';

@Injectable()
export class EmailService {
  private resend: Resend;
  private readonly from: string;
  constructor(private readonly configService: ConfigService<MainConfig>) {
    const emailConfig = configService.get('email', { infer: true });
    this.resend = new Resend(emailConfig.resend.apiKey);
    this.from = emailConfig.from;
  }

  async sendEmailVerification({
    name,
    email,
    token,
  }: {
    name: string;
    email: string;
    token: string;
  }) {
    const clientConfig = this.configService.get('client', { infer: true });
    const link = `${clientConfig.url}/auth/verify-email?token=${token}`;

    const html = await render(
      EmailVerificationEmail({ name, verificationLink: link }),
    );

    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: 'Email Verification',
      html,
    });

    if (error) {
      return console.error({ error });
    }

    return data.id;
  }

  async sendPasswordReset({
    name,
    email,
    token,
  }: {
    name: string;
    email: string;
    token: string;
  }) {
    const clientConfig = this.configService.get('client', { infer: true });
    const link = `${clientConfig.url}/auth/reset-password?token=${token}`;

    const html = await render(
      PasswordResetEmail({ name, passwordResetLink: link }),
    );

    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to: [email],
      subject: 'Password Reset',
      html,
    });

    if (error) {
      return console.error({ error });
    }

    return data.id;
  }
}
