#!/usr/bin/env node

/**
 * ClawNet Server CLI
 */

import { main } from './index';

main().catch((err) => {
  console.error('Failed to start ClawNet Server:', err);
  process.exit(1);
});