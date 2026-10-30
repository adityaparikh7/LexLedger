import fs from 'fs';
import path from 'path';

/** The server package directory. Found by walking up from this file, so it is the same when
 *  run from source (tsx, src/cloud/) and from the bundle (dist-cloud/). */
function findServerRoot(): string {
  let dir = __dirname;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not find the server package above ${__dirname}`);
    dir = parent;
  }
  return dir;
}

export const SERVER_ROOT = findServerRoot();
export const REPO_ROOT = path.dirname(SERVER_ROOT);
export const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'drizzle');
export const CLIENT_DIST = path.join(REPO_ROOT, 'client', 'dist');
