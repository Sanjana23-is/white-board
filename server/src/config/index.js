import dotenv from 'dotenv';
dotenv.config();

const config = Object.freeze({
  port: parseInt(process.env.PORT, 10) || 3001,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
});

export default config;
