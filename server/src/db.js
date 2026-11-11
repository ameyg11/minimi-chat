import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb() {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(config.mongoUri);
  } catch (err) {
    console.error(`Could not connect using MONGODB_URI. ${err.message}`);
    process.exit(1);
  }
}
