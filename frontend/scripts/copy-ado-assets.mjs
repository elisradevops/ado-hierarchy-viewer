import { access, copyFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicLibDir = path.join(rootDir, 'public', 'lib');

const exists = async (candidate) => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

const findExisting = async (candidates) => {
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

const copy = async (label, fromCandidates, toPath) => {
  const src = await findExisting(fromCandidates);
  if (!src) {
    throw new Error(`Missing ${label}. Tried: ${fromCandidates.join(', ')}`);
  }
  await mkdir(path.dirname(toPath), { recursive: true });
  await copyFile(src, toPath);
};

const localNodeModules = path.join(rootDir, 'node_modules');
const workspaceNodeModules = path.join(rootDir, '..', 'node_modules');

async function resolveNodeModules(packageName) {
  const localPath = path.join(localNodeModules, packageName);
  const workspacePath = path.join(workspaceNodeModules, packageName);
  if (await exists(localPath)) return localNodeModules;
  if (await exists(workspacePath)) return workspaceNodeModules;
  throw new Error(`Cannot find ${packageName} in node_modules`);
}

await mkdir(publicLibDir, { recursive: true });

await copy(
  'RequireJS',
  [path.join(await resolveNodeModules('requirejs'), 'requirejs', 'require.js')],
  path.join(publicLibDir, 'require.js')
);

const adoSdkDir = await resolveNodeModules('azure-devops-extension-sdk');
await copy(
  'Azure DevOps SDK',
  [
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'SDK.js'),
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'lib', 'SDK.js'),
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'dist', 'SDK.js'),
  ],
  path.join(publicLibDir, 'SDK.js')
);

await copy(
  'Azure DevOps XDM',
  [
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'XDM.js'),
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'lib', 'XDM.js'),
    path.join(adoSdkDir, 'azure-devops-extension-sdk', 'dist', 'XDM.js'),
  ],
  path.join(publicLibDir, 'XDM.js')
);

const es6PromiseDir = await resolveNodeModules('es6-promise');
await copy(
  'ES6 Promise shim',
  [
    path.join(es6PromiseDir, 'es6-promise', 'dist', 'es6-promise.auto.js'),
    path.join(es6PromiseDir, 'es6-promise', 'auto.js'),
  ],
  path.join(publicLibDir, 'es6-promise', 'auto.js')
);

const es6ObjDir = await resolveNodeModules('es6-object-assign');
await copy(
  'ES6 Object.assign shim',
  [
    path.join(es6ObjDir, 'es6-object-assign', 'dist', 'object-assign-auto.js'),
    path.join(es6ObjDir, 'es6-object-assign', 'auto.js'),
  ],
  path.join(publicLibDir, 'es6-object-assign', 'auto.js')
);

await copy(
  'tslib',
  [path.join(await resolveNodeModules('tslib'), 'tslib', 'tslib.js')],
  path.join(publicLibDir, 'tslib.js')
);

console.log('ADO extension runtime assets copied into public/lib.');
