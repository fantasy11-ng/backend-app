export const mainConfig = () => {
  return {
    server: {
      port: parseInt(process.env.PORT || '3000', 10),
    },
    client: {
      url: process.env.CLIENT_URL as string,
    },
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET as string,
        expiresIn: process.env.JWT_EXPIRES_IN as string,
      },
      refreshToken: {
        expiresIn: parseInt(process.env.REFRESH_TOKEN_EXPIRES_IN || '604800'),
      },
      google: {
        clientID: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        callbackUrl: process.env.GOOGLE_CALLBACK_URL as string,
      },
      facebook: {
        clientID: process.env.FACEBOOK_CLIENT_ID as string,
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET as string,
        callbackUrl: process.env.FACEBOOK_CALLBACK_URL as string,
      },
    },
    db: {
      url: process.env.DATABASE_URL,
    },
    email: {
      resend: {
        apiKey: process.env.RESEND_API_KEY as string,
      },
    },
    externalServices: {
      sportmonks: {
        baseUrl: process.env.SPORTMONKS_BASE_URL,
        apiToken: process.env.SPORTMONKS_API_TOKEN as string,
      },
    },
    predictor: {
      competitionOverride: process.env.PREDICTOR_COMPETITION || '', // 'world-cup' | 'afcon' | 'ucl'
      seasonOverride:
        parseInt(process.env.PREDICTOR_SEASON_ID || '0', 10) || undefined,
    },
  };
};

export type MainConfig = ReturnType<typeof mainConfig>;
