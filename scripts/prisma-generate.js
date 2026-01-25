#!/usr/bin/env node

/**
 * Conditional Prisma Client Generator
 *
 * Skips generation if:
 * 1. Prisma client already exists
 * 2. Schema hasn't changed since last generation
 *
 * Forces regeneration if:
 * - --force flag is passed
 * - Schema file is newer than generated client
 * - Generated client doesn't exist
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma');
const CLIENT_PATH = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');
const HASH_FILE = path.join(CLIENT_PATH, '.schema-hash');

function getSchemaHash() {
  const content = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function shouldGenerate(force) {
  if (force) {
    console.log('[prisma-generate] Force flag detected, regenerating...');
    return true;
  }

  const indexPath = path.join(CLIENT_PATH, 'index.js');
  if (!fs.existsSync(indexPath)) {
    console.log('[prisma-generate] Client does not exist, generating...');
    return true;
  }

  const currentHash = getSchemaHash();
  if (fs.existsSync(HASH_FILE)) {
    const storedHash = fs.readFileSync(HASH_FILE, 'utf-8').trim();
    if (storedHash === currentHash) {
      console.log('[prisma-generate] Schema unchanged, skipping generation.');
      return false;
    }
    console.log('[prisma-generate] Schema changed, regenerating...');
  } else {
    // First run with new system - check timestamps as fallback
    const schemaStat = fs.statSync(SCHEMA_PATH);
    const clientStat = fs.statSync(indexPath);
    if (schemaStat.mtime <= clientStat.mtime) {
      console.log('[prisma-generate] Client is up to date, skipping generation.');
      fs.mkdirSync(path.dirname(HASH_FILE), { recursive: true });
      fs.writeFileSync(HASH_FILE, currentHash);
      return false;
    }
    console.log('[prisma-generate] Schema is newer than client, regenerating...');
  }
  return true;
}

function generate() {
  try {
    console.log('[prisma-generate] Running prisma generate...');
    execSync('npx prisma generate', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    fs.mkdirSync(path.dirname(HASH_FILE), { recursive: true });
    fs.writeFileSync(HASH_FILE, getSchemaHash());
    console.log('[prisma-generate] Generation complete.');
  } catch (error) {
    console.error('[prisma-generate] Generation failed:', error.message);
    process.exit(1);
  }
}

const force = process.argv.includes('--force');
if (shouldGenerate(force)) {
  generate();
}
