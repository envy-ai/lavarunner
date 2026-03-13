#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractLdtkCompatMeta } from './lib/ldtk_compat_meta.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const defaultInputPath = path.join(repoRoot, 'assets', 'maps.ldtk');
const defaultOutputPath = path.join(repoRoot, 'assets', 'maps.ldtk.meta.json');

async function main() {
  const [inputPath = defaultInputPath, outputPath = defaultOutputPath] = process.argv.slice(2);

  const raw = await fs.readFile(inputPath, 'utf8');
  const ldtkProject = JSON.parse(raw);
  const compatMeta = extractLdtkCompatMeta(ldtkProject);

  await fs.writeFile(outputPath, `${JSON.stringify(compatMeta, null, 2)}\n`, 'utf8');
  console.log(`Wrote LDtk compat metadata to ${outputPath} from ${inputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
