module.exports = async (req, res) => {
  const { default: app } = await import('./src/server.js');
  app(req, res);
};
