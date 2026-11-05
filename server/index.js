import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendNotification, EMAIL_TYPES } from './email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = isProduction ? 5000 : 3001;

app.use(cors());
app.use(express.json());

app.post('/api/notifications/send', async (req, res) => {
  try {
    const { type, to, data } = req.body;

    if (!type || !to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: type, to',
      });
    }

    if (!EMAIL_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid notification type. Valid types: ${EMAIL_TYPES.join(', ')}`,
      });
    }

    const result = await sendNotification(type, to, data || {});
    res.json(result);
  } catch (error) {
    console.error('Notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
    });
  }
});

app.post('/api/notifications/batch', async (req, res) => {
  try {
    const { notifications } = req.body;

    if (!notifications || !Array.isArray(notifications)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: notifications (array)',
      });
    }

    const results = await Promise.allSettled(
      notifications.map(({ type, to, data }) =>
        sendNotification(type, to, data || {})
      )
    );

    res.json({
      success: true,
      results: results.map((r, i) => ({
        ...notifications[i],
        ...(r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }),
      })),
    });
  } catch (error) {
    console.error('Batch notification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process batch notifications',
    });
  }
});

app.get('/api/notifications/types', (req, res) => {
  res.json({ types: EMAIL_TYPES });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'airhouse-notifications' });
});

if (isProduction) {
  const distPath = path.resolve(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Notification server running on port ${PORT}`);
});
