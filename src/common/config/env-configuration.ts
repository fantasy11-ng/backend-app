export default () => {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
  };
};
