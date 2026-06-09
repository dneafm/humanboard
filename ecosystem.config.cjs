module.exports = {
  apps: [
    {
      name: 'humanboard',
      cwd: __dirname,
      script: './server.mjs',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        HUMANBOARD_HOST: '0.0.0.0',
        HUMANBOARD_PORT: '3001',
      },
      filter_env: [
        'ANTHROPIC_',
        'CODEX_',
        'EFC_',
        'HERMES_',
        'LMSTUDIO_',
        'OPENAI_',
        'TELEGRAM_',
        'VSCODE_',
      ],
      out_file: './logs/pm2-humanboard.out.log',
      error_file: './logs/pm2-humanboard.err.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
