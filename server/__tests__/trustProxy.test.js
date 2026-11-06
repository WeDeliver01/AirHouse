import express from 'express';

import { afterEach, describe, expect, it } from 'vitest';

import { config } from '../config.js';

/**
 * The app sits behind Nginx on 127.0.0.1, and both IP rate limiters key on
 * `req.ip`. If Express does not trust the proxy, `req.ip` is the proxy's own
 * address for every request, so all visitors share a single bucket -- the
 * public lead endpoint's budget becomes the budget for the whole platform.
 *
 * These tests send the headers deploy/nginx/airhouse.co.za.conf actually
 * sets, including `$proxy_add_x_forwarded_for`'s append behaviour, and assert
 * the address the limiter would key on.
 */

const CLIENT = '41.13.9.200';
const ATTACKER_CLAIM = '9.9.9.9';

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((done) => s.close(done))));
});

async function ask({ trustProxy, forwardedFor }) {
  const app = express();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.get('/', (req, res) => res.json({ ip: req.ip, secure: req.secure }));

  const server = await new Promise((ready) => {
    const s = app.listen(0, '127.0.0.1', () => ready(s));
  });
  servers.push(server);

  const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
    headers: {
      'X-Forwarded-For': forwardedFor,
      'X-Real-IP': CLIENT,
      'X-Forwarded-Proto': 'https',
    },
  });
  return response.json();
}

describe('config.trustProxy', () => {
  it('defaults to the loopback hop', () => {
    // `true` would trust the left-most X-Forwarded-For entry, which is
    // attacker-controlled. See the spoofing test below.
    expect(config.trustProxy).toBe('loopback');
  });
});

describe('client address behind Nginx', () => {
  it('without trust proxy, every client looks like the proxy', async () => {
    const { ip, secure } = await ask({ forwardedFor: CLIENT });
    expect(ip).toBe('127.0.0.1');
    // Also wrong: the request arrived over HTTPS at the edge.
    expect(secure).toBe(false);
  });

  it('with the configured value, the real client address is used', async () => {
    const { ip, secure } = await ask({ trustProxy: config.trustProxy, forwardedFor: CLIENT });
    expect(ip).toBe(CLIENT);
    expect(secure).toBe(true);
  });

  it('a client cannot choose its own rate-limit bucket', async () => {
    // Nginx appends the true peer to whatever the caller sent, so the header
    // reaching us is "<claimed>, <real>".
    const { ip } = await ask({
      trustProxy: config.trustProxy,
      forwardedFor: `${ATTACKER_CLAIM}, ${CLIENT}`,
    });
    expect(ip).toBe(CLIENT);
    expect(ip).not.toBe(ATTACKER_CLAIM);
  });

  it("'trust proxy: true' would let a client choose its bucket", async () => {
    // Guards the config default: this is what we are deliberately not doing.
    const { ip } = await ask({ trustProxy: true, forwardedFor: `${ATTACKER_CLAIM}, ${CLIENT}` });
    expect(ip).toBe(ATTACKER_CLAIM);
  });
});
