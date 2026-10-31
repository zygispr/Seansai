/**
 * Vercel entrypoint (vercel.json, service "api"). @vercel/fastify ignores the configured
 * entrypoint and takes the first app/index/server file whose source imports from 'fastify', which
 * would otherwise be src/server.ts (builds the app but never listens). This file sorts first.
 */
import type {} from 'fastify';
import './src/main.ts';
