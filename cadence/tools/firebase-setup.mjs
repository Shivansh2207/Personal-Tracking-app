#!/usr/bin/env node
/**
 * One-shot Firebase project setup for DEVBEAST OS.
 *
 * Uses the service-account key to:
 *   1. verify Cloud Firestore exists and is reachable
 *   2. enable the Email/Password sign-in provider (Identity Platform config)
 *   3. publish `firebase/firestore.rules` as the live ruleset
 *   4. publish any composite indexes declared by the app (currently none)
 *
 * Usage:
 *   node tools/firebase-setup.mjs --key ../_secrets/firebase-admin.json
 *
 * The key path can also come from GOOGLE_APPLICATION_CREDENTIALS.
 * This script is a development/ops helper — it is never bundled into the app.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/firebase',
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/identitytoolkit',
];

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { key: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? null, only: null };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--key') out.key = args[i + 1];
    if (args[i] === '--only') out.only = args[i + 1];
  }
  return out;
}

function log(step, message) {
  process.stdout.write(`${step.padEnd(10)} ${message}\n`);
}

async function main() {
  const { key, only } = parseArgs();
  if (!key) {
    console.error(
      'Missing service account key. Pass --key <path> or set GOOGLE_APPLICATION_CREDENTIALS.',
    );
    process.exit(1);
  }

  const keyPath = resolve(process.cwd(), key);
  const credentials = JSON.parse(readFileSync(keyPath, 'utf8'));
  const projectId = credentials.project_id;
  if (!projectId) {
    console.error('Service account key has no project_id.');
    process.exit(1);
  }

  log('project', projectId);

  const auth = new GoogleAuth({ credentials, scopes: SCOPES });
  const client = await auth.getClient();

  const request = async (url, init = {}) => {
    const res = await client.request({
      url,
      method: init.method ?? 'GET',
      data: init.body,
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  };

  const steps = {
    async firestore() {
      const res = await request(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases`,
      );
      if (res.status !== 200) {
        log('firestore', `could not list databases (HTTP ${res.status})`);
        return false;
      }
      const databases = res.data?.databases ?? [];
      const def = databases.find((d) => d.name?.endsWith('/(default)')) ?? databases[0];
      if (!def) {
        log('firestore', 'NOT PROVISIONED — create a Firestore database in the console first');
        return false;
      }
      log('firestore', `ready (${def.locationId ?? 'unknown region'}, ${def.type ?? 'NATIVE'})`);
      return true;
    },

    async authProviders() {
      const url =
        `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config` +
        `?updateMask=signIn.email.enabled,signIn.email.passwordRequired`;
      const res = await request(url, {
        method: 'PATCH',
        body: { signIn: { email: { enabled: true, passwordRequired: true } } },
      });
      if (res.status === 200) {
        log('auth', 'email/password sign-in enabled');
        return true;
      }
      log(
        'auth',
        `could not update sign-in config (HTTP ${res.status}). ` +
          'Enable Email/Password manually in Console > Authentication > Sign-in method.',
      );
      return false;
    },

    async rules() {
      const source = readFileSync(resolve(ROOT, 'firebase/firestore.rules'), 'utf8');

      const created = await request(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`,
        {
          method: 'POST',
          body: { source: { files: [{ name: 'firestore.rules', content: source }] } },
        },
      );
      if (created.status !== 200) {
        log('rules', `ruleset upload failed (HTTP ${created.status})`);
        if (created.data) console.error(JSON.stringify(created.data, null, 2));
        return false;
      }
      const rulesetName = created.data.name;
      log('rules', `ruleset created ${rulesetName.split('/').pop()}`);

      // Firebase projects already have a `cloud.firestore` release, so PATCH is
      // the normal path; POST only matters for a project that has never had
      // rules published.
      const releaseName = `projects/${projectId}/releases/cloud.firestore`;
      const patched = await request(`https://firebaserules.googleapis.com/v1/${releaseName}`, {
        method: 'PATCH',
        body: { release: { name: releaseName, rulesetName } },
      });
      if (patched.status === 200) {
        log('rules', 'published to cloud.firestore');
        return true;
      }

      const createdRelease = await request(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`,
        { method: 'POST', body: { name: releaseName, rulesetName } },
      );
      if (createdRelease.status === 200) {
        log('rules', 'published to cloud.firestore');
        return true;
      }
      log('rules', `publish failed (HTTP ${patched.status}/${createdRelease.status})`);
      if (patched.data?.error) console.error(JSON.stringify(patched.data.error, null, 2));
      return false;
    },

    async indexes() {
      const config = JSON.parse(
        readFileSync(resolve(ROOT, 'firebase/firestore.indexes.json'), 'utf8'),
      );
      let ok = true;
      for (const index of config.indexes ?? []) {
        const url =
          `https://firestore.googleapis.com/v1/projects/${projectId}` +
          `/databases/(default)/collectionGroups/${index.collectionGroup}/indexes`;
        const res = await request(url, {
          method: 'POST',
          body: {
            queryScope: index.queryScope,
            fields: index.fields.map((f) => ({ fieldPath: f.fieldPath, order: f.order })),
          },
        });
        if (res.status === 200) {
          log('indexes', `${index.collectionGroup}: building`);
        } else if (res.status === 409) {
          log('indexes', `${index.collectionGroup}: already exists`);
        } else {
          log('indexes', `${index.collectionGroup}: failed (HTTP ${res.status})`);
          ok = false;
        }
      }
      if ((config.indexes ?? []).length === 0) log('indexes', 'none required');
      return ok;
    },
  };

  const order = only ? [only] : ['firestore', 'authProviders', 'rules', 'indexes'];
  let allOk = true;
  for (const step of order) {
    if (!steps[step]) {
      console.error(`Unknown step: ${step}`);
      process.exit(1);
    }
    const ok = await steps[step]();
    allOk = allOk && ok;
  }

  process.stdout.write(`\n${allOk ? 'Setup complete.' : 'Setup finished with warnings (see above).'}\n`);
  process.exit(allOk ? 0 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
