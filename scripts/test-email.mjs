#!/usr/bin/env node
/**
 * Send one real email with the deployment's own configuration.
 *
 *   node scripts/test-email.mjs you@example.com
 *
 * Use this before trusting the platform's notifications. It exercises the same
 * code path the server uses -- the same settings, transport and template --
 * so a success here means a lead notification will arrive, and a failure
 * reports the relay's own words rather than a generic 500.
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
const { describeSmtp, sendNotification, verifyEmailTransport } = await import('../server/email.js');

const described = describeSmtp();
if (!described.ok) {
  console.error(`\nNot configured: ${described.error}\n`);
  process.exit(1);
}

console.log(`\nRelay   ${config.smtp.host}:${config.smtp.port}`);
console.log(`TLS     ${described.options.secure ? 'implicit (465-style)' : described.options.requireTLS ? 'STARTTLS, required' : 'STARTTLS, optional'}`);
console.log(`Auth    ${config.smtp.user ? config.smtp.user : 'none (unauthenticated relay)'}`);
console.log(`From    ${config.emailFrom}`);
console.log(`To      ${recipient}\n`);

process.stdout.write('Checking the relay accepts us... ');
const verified = await verifyEmailTransport();
if (!verified.ok) {
  console.log('no.\n');
  console.error(`  ${verified.error}\n`);
  console.error('Common causes: wrong port for the TLS mode, an account password');
  console.error('where an app password is required, or SMTP sending not enabled');
  console.error('on the mailbox.\n');
  process.exit(1);
}
console.log('yes.');

process.stdout.write('Sending a welcome template...      ');
const sent = await sendNotification('welcome', recipient, { userName: 'SMTP test', role: 'creator' });

if (!sent.success) {
  console.log('failed.\n');
  console.error(`  ${sent.error}\n`);
  process.exit(1);
}

console.log(`sent.\n\n  message id ${sent.id}\n`);
console.log('Check the inbox, and the spam folder. If it only lands in spam,');
console.log('the sending domain still needs SPF and DKIM records.\n');
process.exit(0);
