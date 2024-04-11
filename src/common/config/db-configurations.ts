const dbConfigurations = () => ({
  neondb: {
    url: process.env.DATABASE_URL,
  },
});

export type DBConfigurations = ReturnType<typeof dbConfigurations>;

export default dbConfigurations;
