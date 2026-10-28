import dotenv from 'dotenv';

dotenv.config();

export const redis = {
  get: async () => null,
  set: async () => 'OK',
  del: async () => 1,
  scanStream: () => ({
    [Symbol.asyncIterator]: async function* () {}
  }),
  on: () => {},
  ping: async () => 'PONG'
};

export const checkRedisConnection = async () => {
  return true;
};
