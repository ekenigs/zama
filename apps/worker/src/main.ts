import { runDecryptLoop } from './loop.js';

const controller = new AbortController();

process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

console.log('Decrypt worker starting…');

await runDecryptLoop(controller.signal);

console.log('Decrypt worker stopped');
