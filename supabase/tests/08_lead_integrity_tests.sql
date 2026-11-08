-- Lead validation, deduplication, attribution and pipeline assertions (024).

DO $$
DECLARE
  n INT; v_lead UUID; v_dup UUID; v_stage TEXT; v_creator UUID;
BEGIN
  RAISE NOTICE '--- LEAD VALIDATION ---';

  -- Campaign 1 is active, so it accepts enquiries.
  BEGIN
    INSERT INTO leads (campaign_id, lead_name, lead_email)
    VALUES ('cccccccc-0000-4000-8000-000000000001', 'A', 'nobody@example.com');
    PERFORM expect('A one-character name is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A one-character name is refused', TRUE);
  END;

  BEGIN
    INSERT INTO leads (campaign_id, lead_name, lead_email)
    VALUES ('cccccccc-0000-4000-8000-000000000001', 'No Contact', NULL);
    PERFORM expect('An enquiry with no email and no phone is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('An enquiry with no email and no phone is refused', TRUE);
  END;

  BEGIN
    INSERT INTO leads (campaign_id, lead_name, lead_email)
    VALUES ('cccccccc-0000-4000-8000-000000000001', 'Bad Email', 'not-an-email');
    PERFORM expect('A malformed email is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A malformed email is refused', TRUE);
  END;

  BEGIN
    INSERT INTO leads (campaign_id, lead_name, lead_email, notes)
    VALUES ('cccccccc-0000-4000-8000-000000000001', 'Spammer', 'spam@example.com',
            repeat('x', 6000));
    PERFORM expect('An oversized notes field is refused', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('An oversized notes field is refused', TRUE);
  END;

  -- A campaign that is not accepting enquiries.
  BEGIN
    INSERT INTO leads (campaign_id, lead_name, lead_email)
    VALUES ('cccccccc-0000-4000-8000-000000000002', 'Too Late', 'late@example.com');
    PERFORM expect('An archived campaign refuses enquiries', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('An archived campaign refuses enquiries', TRUE);
  END;

  RAISE NOTICE '--- DEDUPLICATION ---';

  INSERT INTO leads (campaign_id, lead_name, lead_email, lead_phone, consent_given)
  VALUES ('cccccccc-0000-4000-8000-000000000001', 'Thandi Mokoena',
          'Thandi@Example.com', '082 123 4567', TRUE)
  RETURNING id INTO v_lead;
  PERFORM expect('A valid enquiry is accepted', v_lead IS NOT NULL);

  PERFORM expect('Consent timestamp is captured',
    (SELECT consent_at FROM leads WHERE id = v_lead) IS NOT NULL);
  PERFORM expect('Email is normalised to lower case',
    (SELECT normalised_email FROM leads WHERE id = v_lead) = 'thandi@example.com');
  PERFORM expect('Phone is normalised to digits',
    (SELECT normalised_phone FROM leads WHERE id = v_lead) = '0821234567');

  -- Same person, different formatting, same campaign.
  INSERT INTO leads (campaign_id, lead_name, lead_email)
  VALUES ('cccccccc-0000-4000-8000-000000000001', 'Thandi M', 'THANDI@example.com')
  RETURNING id INTO v_dup;
  PERFORM expect('A repeat enquiry is flagged as a duplicate',
    (SELECT duplicate_of FROM leads WHERE id = v_dup) = v_lead);
  PERFORM expect('The duplicate is staged as duplicate, not new',
    (SELECT pipeline_stage::text FROM leads WHERE id = v_dup) = 'duplicate');

  -- Matching on a differently formatted phone number.
  INSERT INTO leads (campaign_id, lead_name, lead_phone)
  VALUES ('cccccccc-0000-4000-8000-000000000001', 'T Mokoena', '+27 82 123 4567')
  RETURNING id INTO v_dup;
  PERFORM expect('A duplicate is caught across phone formats',
    (SELECT duplicate_of FROM leads WHERE id = v_dup) IS NOT NULL);

  RAISE NOTICE '--- ATTRIBUTION INTEGRITY ---';

  -- An unassigned creator cannot be credited.
  INSERT INTO leads (campaign_id, creator_id, referral_code, lead_name, lead_email)
  VALUES ('cccccccc-0000-4000-8000-000000000001',
          '33333333-3333-4333-8333-333333333333', 'FAKEREF',
          'Wrong Attribution', 'wrong@example.com')
  RETURNING id INTO v_lead;

  SELECT creator_id INTO v_creator FROM leads WHERE id = v_lead;
  PERFORM expect('A lead claiming an unassigned creator is not attributed to them',
                 v_creator IS NULL);
  PERFORM expect('The bogus referral code is cleared',
    (SELECT referral_code FROM leads WHERE id = v_lead) IS NULL);

  -- An assigned creator is credited, and the timestamp is stamped.
  INSERT INTO leads (campaign_id, creator_id, referral_code, lead_name, lead_email)
  VALUES ('cccccccc-0000-4000-8000-000000000001',
          '22222222-2222-4222-8222-222222222222', 'REALREF',
          'Right Attribution', 'right@example.com')
  RETURNING id INTO v_lead;
  PERFORM expect('A lead from an assigned creator is attributed',
    (SELECT creator_id FROM leads WHERE id = v_lead) = '22222222-2222-4222-8222-222222222222');
  PERFORM expect('Attribution is timestamped',
    (SELECT attributed_at FROM leads WHERE id = v_lead) IS NOT NULL);

  RAISE NOTICE '--- PIPELINE TRANSITIONS ---';

  PERFORM expect('A new lead starts at new',
    (SELECT pipeline_stage::text FROM leads WHERE id = v_lead) = 'new');

  -- A click is not a sale: new cannot jump straight to converted.
  BEGIN
    UPDATE leads SET pipeline_stage = 'converted' WHERE id = v_lead;
    PERFORM expect('A lead cannot jump from new straight to converted', FALSE);
  EXCEPTION WHEN check_violation THEN
    PERFORM expect('A lead cannot jump from new straight to converted', TRUE);
  END;

  UPDATE leads SET pipeline_stage = 'contacted' WHERE id = v_lead;
  UPDATE leads SET pipeline_stage = 'qualified' WHERE id = v_lead;
  UPDATE leads SET pipeline_stage = 'site_visit' WHERE id = v_lead;
  UPDATE leads SET pipeline_stage = 'converted' WHERE id = v_lead;
  PERFORM expect('A lead can progress through the full pipeline',
    (SELECT pipeline_stage::text FROM leads WHERE id = v_lead) = 'converted');

  SELECT count(*) INTO n FROM lead_activities
  WHERE lead_id = v_lead AND activity_type = 'status_change';
  PERFORM expect('Each stage change is recorded as activity', n = 4);

  RAISE NOTICE '--- ATTRIBUTION REPORTING ---';

  SELECT leads_converted INTO n FROM creator_attribution_summary
  WHERE creator_id = '22222222-2222-4222-8222-222222222222'
    AND campaign_id = 'cccccccc-0000-4000-8000-000000000001';
  PERFORM expect('Conversions are counted against the attributed creator', n = 1);

  SELECT leads_total INTO n FROM creator_attribution_summary
  WHERE creator_id = '22222222-2222-4222-8222-222222222222'
    AND campaign_id = 'cccccccc-0000-4000-8000-000000000001';
  PERFORM expect('Totals count only attributed leads', n = 1);
END $$;
