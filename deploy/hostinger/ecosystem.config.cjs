/**
 * PM2 process file for Hostinger VPS.
 * From repo root on server: pm2 start deploy/hostinger/ecosystem.config.cjs
 * Save boot: pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'skilz-api',
      cwd: '/var/www/skilz',
      script: 'backend/src/bootstrapEnv.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '800M',
      error_file: '/var/log/pm2/skilz-api-error.log',
      out_file: '/var/log/pm2/skilz-api-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
