-- ============================================
-- Messages Table - Direct messaging between platform users
-- (creator <-> developer; admins can view all)
-- Polled at 15s intervals; no realtime / no email triggers.
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 4000),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (sender_id <> recipient_id)
);

-- Indexes for the conversation queries we run on the client
CREATE INDEX IF NOT EXISTS idx_messages_sender_recipient_created
  ON messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_sender_created
  ON messages (recipient_id, sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_unread
  ON messages (recipient_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_campaign
  ON messages (campaign_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Users can read messages where they are sender or recipient
DROP POLICY IF EXISTS "Users can read their own messages" ON messages;
CREATE POLICY "Users can read their own messages" ON messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = recipient_id
  );

-- Senders can insert messages (must be the sender; can only send to creator/developer/admin)
DROP POLICY IF EXISTS "Users can send messages as themselves" ON messages;
CREATE POLICY "Users can send messages as themselves" ON messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND auth.uid() <> recipient_id
    AND EXISTS (SELECT 1 FROM profiles WHERE id = recipient_id)
  );

-- Recipients can mark their own incoming messages as read (only read_at field is meant to change)
DROP POLICY IF EXISTS "Recipients can mark messages read" ON messages;
CREATE POLICY "Recipients can mark messages read" ON messages
  FOR UPDATE USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- Admins (super_admins) can read everything for moderation / support
DROP POLICY IF EXISTS "Admins can read all messages" ON messages;
CREATE POLICY "Admins can read all messages" ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
