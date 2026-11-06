#!/usr/bin/env node
/**
 * Send one real email with the deployment's own configuration.
 *
 *   node scripts/test-email.mjs you@example.com
 *
 * Use this before trusting the platform's notifications. It exercises the same
 * code path the server uses -- the same credentials and template -- so a
 * success here means a lead notification will arrive, and a failure reports
 * the provider's own words rather than a generic 500.
 *
 * On the server, load the production settings first:
 *
 *   set -a; . deploy/.env.production; set +a
 *   node scripts/test-email.mjs you@example.com
 */
import process from 'process';

const recipient = process.argv[2];

if (!recipient || !recipient.includes('@')) {
  console.error('Usage: node scripts/test-email.mjs <recipient@example.com>');
  process.exit(2);
}

const { config } = await import('../server/config.js');
const { sendNotification } = await import('../server/email.js');

if (!config.resendApiKey) {
  console.error('\nRESEND_API_KEY is not set in this environment.\n');
  process.exit(1);
}

const from = config.resendFromEmail || '(default sender)';

console.log(`\nProvider  Resend`);
console.log(`Key       ${config.resendApiKey.slice(0, 6)}… (${config.resendApiKey.length} chars)`);
console.log(`From      ${from}`);
console.log(`To        ${recipient}\n`);

process.stdout.write('Sending a welcome template... ');
const sent = await sendNotification('welcome', recipient, { userName: 'Email test', role: 'creator' });

if (!sent.success) {
  console.log('failed.\n');
  console.error(`  ${sent.error}\n`);
  console.error('The usual causes:');
  console.error('  - the sending domain is not verified in Resend, so the');
  console.error('    From address is refused. Resend → Domains → Add Domain,');
  console.error('    then add the DKIM and SPF records it gives you.');
  console.error('  - the API key was revoked, or is a restricted key without');
  console.error('    sending permission.');
  console.error('  - the monthly quota is exhausted.\n');
  console.error('To send before the domain is verified, set');
  console.error('RESEND_FROM_EMAIL=onboarding@resend.dev -- note that only');
  console.error('reaches the address that owns the Resend account.\n');
  process.exit(1);
}

console.log(`sent.\n\n  message id ${sent.id}\n`);
console.log('Check the inbox, and the spam folder. If it only lands in spam,');
console.log('the sending domain still needs SPF and DKIM records.\n');
process.exit(0);
