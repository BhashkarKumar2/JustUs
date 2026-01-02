const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  console.log('Setting up proxy to:', apiUrl);
  app.use(createProxyMiddleware('/api', { 
    target: apiUrl, 
    changeOrigin: true,
    credentials: 'include',
    onProxyReq: (proxyReq, req, res) => {
      // Ensure auth headers are passed through
      const token = req.headers.authorization || req.headers['x-token'];
      if (token) {
        proxyReq.setHeader('Authorization', token);
      }
    }
  }));
};
