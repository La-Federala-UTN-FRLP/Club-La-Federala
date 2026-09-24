'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'src', 'generated', 'prisma');
const destDir = path.join(projectRoot, 'dist', 'generated', 'prisma');

if (!fs.existsSync(sourceDir)) {
  console.error(
    `copy-prisma-generated: source not found: ${sourceDir}. ` +
      'prisma generate must run before this script.',
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(destDir), { recursive: true });

if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}

fs.cpSync(sourceDir, destDir, { recursive: true });
console.log('copy-prisma-generated: copied Prisma client to dist/generated/prisma');
