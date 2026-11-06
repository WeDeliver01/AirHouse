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
 * On the server, run it inside the container, which already holds the
 * production settings and the dependencies:
 *
 *   docker compose --env-file deploy/.env.production \
 *     exec app node scripts/test-email.mjs you@example.com
 *
 * Do NOT load the env file into your shell with `. deploy/.env.production` to
 * run this on the host. That treats the configuration file as a shell script,
 * so an ordinary value such as
 *
 *   RESEND_FROM_EMAIL=AirHouse <admin@airhouse.co.za>
 *
 * is a syntax error. The container is given the settings by compose, which
 * does not have that problem.
 */
import process from 'process';

const recipient = process.argv[2];

if (!recipient || !recipient.includes('@')) {
  console.error('Usage: node scripts/test-email.mjs <your-own-address>');
  console.error('Use a real inbox you can open. Before a sending domain is');
  console.error('verified, Resend only delivers to the address that owns the');
  console.error('Resend account.');
  process.exit(2);
}

// example.com and friends are reserved by IANA and every provider refuses
// them, so a placeholder copied out of documentation fails for a reason that
// has nothing to do with this deployment. Catch it here rather than spending a
// send and reporting a misleading cause.
const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net', 'example.edu', 'test', 'invalid', 'localhost'];
const recipientDomain = recipient.split('@').pop().toLowerCase();

if (RESERVED_DOMAINS.includes(recipientDomain)) {
  console.error(`\n${recipient} is a documentation placeholder, not a real address.`);
  console.error(`${recipientDomain} is reserved by IANA and every email provider refuses it.\n`);
  console.error('Use a real inbox you can open. Before a sending domain is');
  console.error('verified, Resend only delivers to the address that owns the');
  console.error('Resend account.\n');
  process.exit(2);
}

let config;
let sendNotification;

try {
  ({ config } = await import('../server/config.js'));
  ({ sendNotification } = await import('../server/email.js'));
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error('\nThe application dependencies are not installed here.\n');
    console.error('This runs inside the container, which already has them and');
    console.error('the production settings:\n');
    console.error('  docker compose --env-file deploy/.env.production \\');
    console.error('    exec app node scripts/test-email.mjs <recipient@example.com>\n');
    process.exit(1);
  }
  throw error;
}

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

  // Advise on what actually went wrong, rather than listing every
  // possibility and leaving the operator to guess which one applies.
  const reason = sent.error.toLowerCase();

  if (reason.includes('`to`') || reason.includes('to field') || reason.includes('testing email')) {
    console.error('The recipient was refused, not the sender. Until a sending');
    console.error('domain is verified, Resend delivers only to the address that');
    console.error('owns the Resend account. Try that address.\n');
  } else if (reason.includes('domain') || reason.includes('from')) {
    console.error(`The sending address ${from} was refused.`);
    console.error('Verify the domain under Resend → Domains, then add the DKIM');
    console.error('and SPF records it gives you. To send in the meantime, set');
    console.error('RESEND_FROM_EMAIL=onboarding@resend.dev -- that reaches only');
    console.error('the address that owns the Resend account.\n');
  } else if (reason.includes('api key') || reason.includes('unauthorized') || reason.includes('restricted')) {
    console.error('The API key was refused. It may have been revoked, or it may');
    console.error('be a restricted key without sending permission. Create a new');
    console.error('one under Resend → API Keys with sending access.\n');
  } else if (reason.includes('quota') || reason.includes('rate limit')) {
    console.error('The account has hit a sending limit. Check the usage and plan');
    console.error('under Resend → Settings.\n');
  } else if (reason.includes('could not be resolved') || reason.includes('fetch')) {
    console.error('The provider could not be reached at all. Check that outbound');
    console.error('HTTPS to api.resend.com is permitted from this host.\n');
  } else {
    console.error('Check the message above against the Resend dashboard logs.\n');
  }

  process.exit(1);
}

console.log(`sent.\n\n  message id ${sent.id}\n`);
console.log('Check the inbox, and the spam folder. If it only lands in spam,');
console.log('the sending domain still needs SPF and DKIM records.\n');
process.exit(0);
