-- ============================================
-- 013_developer_creator_favorites.sql
-- Lets developers bookmark creators from the marketplace and revisit
-- them across browsing sessions. Each developer only sees their own
-- favourites (RLS).
-- ============================================

CREATE TABLE IF NOT EXISTS developer_creator_favorites (
  developer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (developer_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_dcf_developer
  ON developer_creator_favorites(developer_id);
CREATE INDEX IF NOT EXISTS idx_dcf_creator
  ON developer_creator_favorites(creator_id);

ALTER TABLE developer_creator_favorites ENABLE ROW LEVEL SECURITY;

-- A developer can read only their own favourites
DROP POLICY IF EXISTS "Developers read own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers read own favorites" ON developer_creator_favorites
  FOR SELECT
  USING (developer_id = auth.uid());

-- A developer can insert favourites only for themselves, and only for
-- profiles whose role is 'creator'.
DROP POLICY IF EXISTS "Developers add own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers add own favorites" ON developer_creator_favorites
  FOR INSERT
  WITH CHECK (
    developer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles d
      WHERE d.id = auth.uid() AND d.role = 'developer'
    )
    AND EXISTS (
      SELECT 1 FROM profiles c
      WHERE c.id = creator_id AND c.role = 'creator'
    )
  );

-- A developer can delete only their own favourites
DROP POLICY IF EXISTS "Developers remove own favorites" ON developer_creator_favorites;
CREATE POLICY "Developers remove own favorites" ON developer_creator_favorites
  FOR DELETE
  USING (developer_id = auth.uid());

-- Super admins have full access (helper from migration 010)
DROP POLICY IF EXISTS "Super admins full access on developer_creator_favorites"
  ON developer_creator_favorites;
CREATE POLICY "Super admins full access on developer_creator_favorites"
  ON developer_creator_favorites
  FOR ALL
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

COMMENT ON TABLE developer_creator_favorites IS
  'Per-developer bookmarks of creator profiles from the marketplace. '
  'RLS scopes every row to the owning developer. Anonymous users have '
  'no access — the marketplace UI prompts them to sign in.';
