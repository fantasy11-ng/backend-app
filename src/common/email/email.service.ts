import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { MainConfig } from '../config/main.config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private resend: Resend;
  constructor(private readonly configService: ConfigService<MainConfig>) {
    const emailConfig = configService.get('email', { infer: true });
    this.resend = new Resend(emailConfig.resend.apiKey);
  }

  interpolateTemplate(templatePath: string, data: Record<string, any>) {
    const template = fs.readFileSync(templatePath, { encoding: 'utf-8' });
    return template.replace(/{{\s*([^}]+)\s*}}/g, (_, key) => {
      return data[key];
    });
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

    const message = this.interpolateTemplate(
      path.join(__dirname, './templates/email-verification.html'),
      { name, verificationLink: link },
    );

    const { data, error } = await this.resend.emails.send({
      from: 'Acme <onboarding@resend.dev>',
      to: [email],
      subject: 'Email Verification',
      html: message,
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
    console.log(path.join(__dirname, 'templates/password-reset.html'));
    const message = this.interpolateTemplate(
      path.join(__dirname, 'templates/password-reset.html'),
      { name, passwordResetLink: link },
    );

    const { data, error } = await this.resend.emails.send({
      from: 'Acme <onboarding@resend.dev>',
      to: [email],
      subject: 'Password Reset',
      html: message,
    });

    if (error) {
      return console.error({ error });
    }

    return data.id;
  }
}
