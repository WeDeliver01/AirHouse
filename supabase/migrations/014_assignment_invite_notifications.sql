-- ============================================
-- 014_assignment_invite_notifications.sql
--
-- When a developer creates a `campaign_assignments` row (e.g. by
-- accepting an application or sending a direct invite from the
-- Marketplace / public Creator Profile), insert a corresponding
-- in-app notification for the creator so they see a persistent
-- entry in their notification bell. Email is still handled by the
-- existing /api/notifications/send pathway from the client.
--
-- Runs as SECURITY DEFINER so it bypasses the
-- "Users can manage own notifications" RLS policy that would
-- otherwise block a developer from inserting into another user's
-- notifications row.
-- ============================================

CREATE OR REPLACE FUNCTION notify_creator_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_user_id UUID;
  campaign_title TEXT;
  developer_name TEXT;
BEGIN
  -- Resolve the creator's auth user id from creator_profiles.
  SELECT user_id INTO creator_user_id
  FROM creator_profiles
  WHERE id = NEW.creator_id;

  IF creator_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Best-effort campaign title + developer name for the message body.
  SELECT
    COALESCE(c.title, c.property_name, 'a new campaign'),
    COALESCE(p.full_name, p.company_name, 'A developer')
  INTO campaign_title, developer_name
  FROM campaigns c
  LEFT JOIN profiles p ON p.id = c.developer_id
  WHERE c.id = NEW.campaign_id;

  INSERT INTO notifications (user_id, type, title, message, action_url, metadata)
  VALUES (
    creator_user_id,
    'campaign_assigned',
    'New campaign invite',
    developer_name || ' invited you to ' || campaign_title,
    '/creator/campaigns',
    jsonb_build_object(
      'campaign_id', NEW.campaign_id,
      'assignment_id', NEW.id
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_creator_on_assignment_trigger ON campaign_assignments;
CREATE TRIGGER notify_creator_on_assignment_trigger
  AFTER INSERT ON campaign_assignments
  FOR EACH ROW
  EXECUTE FUNCTION notify_creator_on_assignment();

COMMENT ON FUNCTION notify_creator_on_assignment IS
  'Inserts a persistent in-app notification for the creator whenever '
  'they are assigned to a campaign (application accepted OR direct '
  'marketplace invite). Runs as SECURITY DEFINER to bypass the '
  'per-user RLS policy on notifications.';
