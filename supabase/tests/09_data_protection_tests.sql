-- POPIA machinery assertions (migration 025).

DO $$
DECLARE res TEXT; j JSONB; n INT;
BEGIN
  RAISE NOTICE '--- DATA INVENTORY ---';

  SELECT count(*) INTO n FROM data_inventory;
  PERFORM expect('Every personal-data table is inventoried', n >= 15);

  SELECT count(*) INTO n FROM data_inventory WHERE category = 'special';
  PERFORM expect('Identity documents are classified as special category', n >= 1);

  RAISE NOTICE '--- EXPORT ---';

  PERFORM set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222', true);
  j := export_my_data();
  PERFORM expect('A user can export their own data', j ? 'profile');
  PERFORM expect('The export includes financial history', j ? 'transactions');
  PERFORM expect('The export is timestamped', j ? 'exported_at');

  SELECT count(*) INTO n FROM data_subject_requests
  WHERE subject_id='22222222-2222-4222-8222-222222222222' AND request_type='export';
  PERFORM expect('The export request is recorded', n = 1);

  RAISE NOTICE '--- ERASURE ---';

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT erase_user_data('33333333-3333-4333-8333-333333333333','test')::text$q$);
  PERFORM expect('A creator cannot erase another user', res LIKE 'ERR:Only super admins%');

  -- A creator with money owed cannot be erased: the funds would be stranded.
  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT erase_user_data('22222222-2222-4222-8222-222222222222','test')::text$q$);
  PERFORM expect('An account holding a balance cannot be erased', res LIKE 'ERR:%still holds a balance%');

  -- The outsider has no balance, so erasure proceeds.
  PERFORM set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444', true);
  j := erase_user_data('33333333-3333-4333-8333-333333333333','subject request');
  PERFORM expect('An account with no balance can be erased', (j->>'success') = 'true');

  PERFORM expect('Contact details are removed',
    (SELECT email FROM profiles WHERE id='33333333-3333-4333-8333-333333333333') IS NULL);
  PERFORM expect('The name is replaced rather than left in place',
    (SELECT full_name FROM profiles WHERE id='33333333-3333-4333-8333-333333333333') = 'Deleted user');

  SELECT count(*) INTO n FROM data_subject_requests
  WHERE subject_id='33333333-3333-4333-8333-333333333333' AND request_type='erasure';
  PERFORM expect('The erasure is recorded with its outcome', n = 1);

  PERFORM expect('What was retained, and why, is recorded',
    (SELECT outcome ? 'retained' FROM data_subject_requests
     WHERE subject_id='33333333-3333-4333-8333-333333333333' AND request_type='erasure'));

  RAISE NOTICE '--- RETENTION ---';

  res := try_sql('22222222-2222-4222-8222-222222222222',
    $q$SELECT apply_retention('notifications')::text$q$);
  PERFORM expect('A creator cannot apply retention', res LIKE 'ERR:Only super admins%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT apply_retention('audit_logs')::text$q$);
  PERFORM expect('Retention refuses to sweep the audit trail',
                 res LIKE 'ERR:%accountability record%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT apply_retention('ledger_entries')::text$q$);
  PERFORM expect('Retention refuses to sweep the financial ledger',
                 res LIKE 'ERR:%accountability record%');

  res := try_sql('44444444-4444-4444-8444-444444444444',
    $q$SELECT apply_retention('notifications')::text$q$);
  PERFORM expect('Retention runs for an ordinary table', res LIKE 'OK:%"success": true%');
END $$;
