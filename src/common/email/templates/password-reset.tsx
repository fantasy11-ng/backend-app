import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface PasswordResetEmailProps {
  name: string;
  passwordResetLink: string;
}

export const PasswordResetEmail = ({
  name,
  passwordResetLink,
}: PasswordResetEmailProps) => (
  <Html>
    <Head />
    <Preview>Reset your Fantasy 11 password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={header}>Fantasy 11 Password Reset</Heading>
        <Section style={content}>
          <Text>Hi {name},</Text>
          <Text>
            We received a request to reset the password for your Fantasy 11
            account. If you did not make this request, please ignore this email.
            Otherwise, you can reset your password by clicking on the button
            below:
          </Text>
          <Button href={passwordResetLink} style={button}>
            Reset Password
          </Button>
          <Text>This password reset link will expire in 24 hours.</Text>
          <Text>
            If you&apos;re having trouble clicking the button, copy and paste the
            URL below into your web browser:
          </Text>
          <Text>
            <Link href={passwordResetLink}>{passwordResetLink}</Link>
          </Text>
          <Text>
            If you have any questions or need assistance, please contact our
            support team.
          </Text>
          <Text>Best regards,</Text>
          <Text>The Fantasy 11 Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default PasswordResetEmail;

const main: React.CSSProperties = {
  fontFamily: 'Arial, sans-serif',
  backgroundColor: '#f4f4f4',
  color: '#333',
  padding: '50px',
};

const container: React.CSSProperties = {
  backgroundColor: '#fff',
  margin: 'auto',
  padding: '20px',
  borderRadius: '8px',
  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.05)',
  maxWidth: '600px',
};

const header: React.CSSProperties = {
  fontSize: '24px',
  color: '#4caf50',
  textAlign: 'center',
};

const content: React.CSSProperties = {
  textAlign: 'left',
  lineHeight: '1.6',
};

const button: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '20px',
  padding: '10px 20px',
  backgroundColor: '#4caf50',
  color: '#fff',
  textDecoration: 'none',
  borderRadius: '5px',
  fontWeight: 'bold',
};
