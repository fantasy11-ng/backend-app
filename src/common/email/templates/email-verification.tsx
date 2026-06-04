import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

interface EmailVerificationEmailProps {
  name: string;
  verificationLink: string;
}

export const EmailVerificationEmail = ({
  name,
  verificationLink,
}: EmailVerificationEmailProps) => (
  <Html>
    <Head />
    <Preview>Verify your Fantasy 11 email address</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={header}>Welcome to Fantasy 11!</Heading>
        <Section style={content}>
          <Text>Hi {name},</Text>
          <Text>
            Thanks for signing up for Fantasy 11! We&apos;re excited to have you
            on board. To get started, please verify your email address by
            clicking the button below.
          </Text>
          <Button href={verificationLink} style={button}>
            Verify Email
          </Button>
          <Text>
            If you did not sign up for Fantasy 11, please ignore this email.
          </Text>
          <Text>Cheers,</Text>
          <Text>The Fantasy 11 Team</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default EmailVerificationEmail;

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
