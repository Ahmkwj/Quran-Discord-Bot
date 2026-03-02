/**
 • Name: Ahmed Khawaja  
 • Student ID: 60104808  
 • Created On 02-03-2026-07h-04m
*/

module.exports = {
  apps: [
    {
      name: "quran-bot",
      script: "./src/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      time: true,
    },
  ],
};
