import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..');
const deployScript = path.join(repoRoot, 'deploy', 'deploy.sh');
const examplePath = path.join(repoRoot, 'deploy', '.env.production.example');

const deployScriptSource = readFileSync(deployScript, 'utf8');
const exampleSource = readFileSync(examplePath, 'utf8');

/**
 * Run deploy.sh's own load_env against a file and report what it exported.
 *
 * The function is extracted from the real script rather than reimplemented,
 * so this tests the code that actually runs on the server.
 */
function loadEnv(contents) {
  const dir = mkdtempSync(path.join(tmpdir(), 'airhouse-env-'));
  const envFile = path.join(dir, 'candidate.env');
  writeFileSync(envFile, contents);

  const match = deployScriptSource.match(/^load_env\(\) \{\n[\s\S]*?^\}$/m);
  if (!match) throw new Error('load_env() not found in deploy/deploy.sh');

  const harness = [
    'set -uo pipefail',
    'die() { printf "DIE:%s\\n" "$*" >&2; exit 9; }',
    match[0],
    `ENV_FILE=${JSON.stringify(envFile)}`,
    'load_env',
    // Print only what the file set, NUL-delimited so values with newlines or
    // spaces survive the round trip.
    'while IFS= read -r k; do printf "%s=%s\\0" "$k" "${!k}"; done < <(grep -oE "^[[:space:]]*(export )?[A-Za-z_][A-Za-z0-9_]*=" "$ENV_FILE" | sed -E "s/^[[:space:]]*(export )?//; s/=$//")',
  ].join('\n');

  let stdout;
  try {
    stdout = execFileSync('bash', ['-c', harness], { encoding: 'utf8' });
  } catch (error) {
    const stderr = (error.stderr || '').trim();
    const reason = stderr.split('DIE:')[1] || stderr;
    const refusal = new Error(reason.trim() || 'load_env failed');
    refusal.refused = true;
    throw refusal;
  }

  return Object.fromEntries(
    stdout
      .split('\0')
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf('=');
        return [pair.slice(0, index), pair.slice(index + 1)];
      }),
  );
}

describe('deploy/.env.production.example', () => {
  // The shipped example contained `VITE_BANK_ACCOUNT_NAME=AirHouse (Pty) Ltd`
  // and `RESEND_FROM_EMAIL=AirHouse <notifications@airhouse.co.za>`. The
  // deploy script sourced the file as shell, so both were syntax errors and
  // every first deploy died on line 43 with a message naming no setting.
  it('loads without error', () => {
    expect(() => loadEnv(exampleSource)).not.toThrow();
  });

  it('reads display names and addresses as literal text', () => {
    const env = loadEnv(exampleSource);
    expect(env.VITE_BANK_ACCOUNT_NAME).toBe('AirHouse (Pty) Ltd');
    expect(env.RESEND_FROM_EMAIL).toBe('AirHouse <notifications@airhouse.co.za>');
  });

  // If the example omits a key the script demands, a correctly filled-in copy
  // of it still fails preflight.
  it('names every setting deploy.sh requires', () => {
    const required = deployScriptSource
      .match(/for key in ([\s\S]*?); do/)[1]
      .replace(/\\\n/g, ' ')
      .trim()
      .split(/\s+/);

    expect(required.length).toBeGreaterThan(0);
    for (const key of required) {
      expect(exampleSource).toMatch(new RegExp(`^${key}=`, 'm'));
    }
  });
});

describe('deploy.sh env loading', () => {
  it('does not execute the config file as shell', () => {
    expect(deployScriptSource).not.toMatch(/^\s*(\.|source)\s+"\$ENV_FILE"/m);
  });

  // `source` would run this. A key pasted from a password manager that picked
  // up a stray backtick should be a value, not a command.
  it('treats command substitution in a value as text', () => {
    const env = loadEnv('TOKEN=abc`id`def\nOTHER=$(whoami)\n');
    expect(env.TOKEN).toBe('abc`id`def');
    expect(env.OTHER).toBe('$(whoami)');
  });

  it('keeps values containing = intact', () => {
    expect(loadEnv('KEY=eyJhbGciOi.J9.sig==\n').KEY).toBe('eyJhbGciOi.J9.sig==');
  });

  it('tolerates CRLF line endings', () => {
    expect(loadEnv('KEY=works\r\nNEXT=too\r\n').KEY).toBe('works');
  });

  it('strips one layer of matching quotes, as docker compose does', () => {
    const env = loadEnv('A="spaced out"\nB=\'single quoted\'\n');
    expect(env.A).toBe('spaced out');
    expect(env.B).toBe('single quoted');
  });

  it('refuses a line that is not KEY=value, naming the line', () => {
    expect(() => loadEnv('VALID=1\nthis is not a setting\n')).toThrow(/line 2 is not KEY=value/);
  });

  it('refuses an ambiguous comment after an unquoted value', () => {
    // compose would keep "5000 # the port"; the shell would keep "5000".
    // Guessing either way silently misconfigures the container.
    expect(() => loadEnv('APP_PORT=5000 # the port\n')).toThrow(/comment after its value/);
  });
});
