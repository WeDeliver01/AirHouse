import net from 'net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { describeSmtp } from '../email.js';

/**
 * The transport settings are derived from a handful of environment variables,
 * and getting them wrong is the difference between a delivered message, a
 * rejected one, and a password sent over a plaintext connection. These assert
 * the derivation directly, without opening a socket.
 */
describe('describeSmtp', () => {
  const FROM = 'AirHouse <notifications@airhouse.co.za>';
  const base = {
    host: 'smtp.example.com',
    port: 587,
    user: 'postmaster@airhouse.co.za',
    password: 'secret',
    secure: false,
    requireTls: true,
  };

  it('uses STARTTLS on 587 and requires it', () => {
    const { ok, options } = describeSmtp(base, FROM);
    expect(ok).toBe(true);
    expect(options.secure).toBe(false);
    // Without requireTLS, a relay that does not advertise STARTTLS would be
    // handed the password in the clear.
    expect(options.requireTLS).toBe(true);
  });

  it('uses implicit TLS on 465 and does not ask to upgrade', () => {
    const { options } = describeSmtp({ ...base, port: 465, secure: true }, FROM);
    expect(options.secure).toBe(true);
    expect(options.requireTLS).toBe(false);
  });

  it('allows an unauthenticated relay, for a mail server on this host', () => {
    const { ok, options } = describeSmtp({ ...base, user: '', password: '' }, FROM);
    expect(ok).toBe(true);
    expect(options.auth).toBeUndefined();
  });

  it('refuses a username with no password', () => {
    const { ok, error } = describeSmtp({ ...base, password: '' }, FROM);
    expect(ok).toBe(false);
    expect(error).toMatch(/SMTP_PASSWORD/);
  });

  it('refuses a password with no username', () => {
    const { ok, error } = describeSmtp({ ...base, user: '', password: 'secret' }, FROM);
    expect(ok).toBe(false);
    expect(error).toMatch(/SMTP_USER/);
  });

  it('names what is missing rather than failing vaguely', () => {
    const { ok, error } = describeSmtp({ ...base, host: '' }, FROM);
    expect(ok).toBe(false);
    expect(error).toMatch(/SMTP_HOST/);
  });

  it('requires an envelope sender, since relays will not guess one', () => {
    const { ok, error } = describeSmtp(base, '');
    expect(ok).toBe(false);
    expect(error).toMatch(/EMAIL_FROM/);
  });

  it('pools connections and bounds every timeout', () => {
    const { options } = describeSmtp(base, FROM);
    expect(options.pool).toBe(true);
    // A relay that accepts the connection then goes quiet must not hold a
    // request open indefinitely.
    expect(options.connectionTimeout).toBeGreaterThan(0);
    expect(options.greetingTimeout).toBeGreaterThan(0);
    expect(options.socketTimeout).toBeGreaterThan(0);
  });
});

/**
 * And one end-to-end send against a real SMTP server, so the wiring is proved
 * rather than mocked: a throwaway listener that speaks just enough of the
 * protocol to accept a message, and records what it was handed.
 */
describe('sending through a real SMTP conversation', () => {
  let server;
  let port;
  let received;

  beforeEach(async () => {
    received = { lines: [], body: '' };

    server = net.createServer((socket) => {
      let inData = false;
      socket.write('220 test.local ESMTP\r\n');

      socket.on('data', (chunk) => {
        const text = chunk.toString();
        if (inData) {
          received.body += text;
          if (received.body.includes('\r\n.\r\n')) {
            inData = false;
            socket.write('250 2.0.0 Ok: queued as TESTID\r\n');
          }
          return;
        }

        for (const line of text.split('\r\n').filter(Boolean)) {
          received.lines.push(line);
          const verb = line.split(' ')[0].toUpperCase();
          if (verb === 'EHLO' || verb === 'HELO') socket.write('250-test.local\r\n250 SIZE 10240000\r\n');
          else if (verb === 'MAIL' || verb === 'RCPT') socket.write('250 2.1.0 Ok\r\n');
          else if (verb === 'DATA') { inData = true; socket.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
          else if (verb === 'QUIT') { socket.write('221 2.0.0 Bye\r\n'); socket.end(); }
          else socket.write('250 2.0.0 Ok\r\n');
        }
      });
      socket.on('error', () => {});
    });

    await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
    port = server.address().port;
  });

  afterEach(async () => {
    await new Promise((done) => server.close(done));
  });

  it('delivers a rendered template and reports the message id', async () => {
    const nodemailer = (await import('nodemailer')).default;

    // Same options the application builds, pointed at the throwaway server.
    // Plaintext because the test server offers no TLS; production refuses to
    // do this -- see the requireTLS assertions above.
    const { options } = describeSmtp({
      host: '127.0.0.1',
      port,
      user: '',
      password: '',
      secure: false,
      requireTls: false,
    }, 'AirHouse <notifications@airhouse.co.za>');

    const result = await nodemailer.createTransport({ ...options, pool: false }).sendMail({
      from: 'AirHouse <notifications@airhouse.co.za>',
      to: 'developer@example.com',
      subject: 'New lead',
      html: '<p>Someone enquired.</p>',
    });

    expect(result.rejected).toEqual([]);
    expect(result.messageId).toBeTruthy();

    expect(received.lines.some((l) => l.startsWith('MAIL FROM:<notifications@airhouse.co.za>'))).toBe(true);
    expect(received.lines.some((l) => l.startsWith('RCPT TO:<developer@example.com>'))).toBe(true);
    expect(received.body).toContain('Someone enquired.');
    expect(received.body).toContain('Subject: New lead');
  });
});
