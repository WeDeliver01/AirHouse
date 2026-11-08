# Load tests

Run with [k6](https://k6.io). These are written against a **staging**
environment — never production, because they create real records.

```bash
k6 run -e BASE_URL=https://staging.airhouse.co.za load-tests/lead-capture.js
k6 run -e BASE_URL=https://staging.airhouse.co.za load-tests/browse.js
```

## What is being checked

| Scenario | Why it matters |
|---|---|
| `browse.js` | The public marketplace and campaign pages are what most traffic hits. They must stay fast under a launch spike. |
| `lead-capture.js` | Lead submission is the revenue path. It writes to the database and must not fall over or lose enquiries under load. |

## Thresholds

Each script fails the run if the targets are not met, so these are
pass/fail gates rather than reports to read. The targets are starting
points — revise them once real traffic shows what normal looks like.
