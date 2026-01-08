import winston from 'winston';
import path from 'path';

// Only create file logger on server-side
const transports = [];

// Console transport for everyone
transports.push(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  })
);

// File transport only on server (Node.js environment)
if (typeof window === 'undefined') {
  const fs = require('fs');

  // Use absolute path for safety in Next.js server context, usually process.cwd() is project root
  const logDir = path.join(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'meetcode.log');

  if (!fs.existsSync(logDir)) {
      try {
          fs.mkdirSync(logDir, { recursive: true });
      } catch (err) {
          console.error('Failed to create logs directory:', err);
      }
  }

  transports.push(
    new winston.transports.File({
      filename: logFile,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

export const logger = winston.createLogger({
  level: 'info',
  transports: transports,
});
