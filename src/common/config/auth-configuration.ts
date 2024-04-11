const authConfiguration = () => ({
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL as string,
  },
});

export type AuthConfiguration = ReturnType<typeof authConfiguration>;

export default authConfiguration;
