module.exports = {
  apps: [
    {
      name: 'tradevault-api',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/tradevault/apps/api',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },
  ],
};
