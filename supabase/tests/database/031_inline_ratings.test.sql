begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select has_column('private', 'dog_friendliness_ratings', 'overall_score', 'Current Ratings have an explicit overall score');
select col_not_null('private', 'dog_friendliness_ratings', 'overall_score', 'Overall score is required');
select has_column('private', 'dog_friendliness_rating_events', 'overall_score', 'Rating history snapshots overall');
select has_function('public', 'save_inline_dog_friendliness_rating', array['uuid','integer','integer','integer','integer','integer','uuid','boolean','text','text'], 'Inline autosave RPC exists');
select has_function('public', 'apply_pending_member_rating', array['uuid'], 'Pending pre-auth Rating application exists');
select ok(
  has_function_privilege('authenticated', 'public.save_inline_dog_friendliness_rating(uuid,integer,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Members can autosave Ratings'
);
select ok(
  not has_function_privilege('anon', 'public.save_inline_dog_friendliness_rating(uuid,integer,integer,integer,integer,integer,uuid,boolean,text,text)', 'execute'),
  'Visitors cannot autosave Ratings'
);
select is((select minimum_eligible_count from private.dog_friendliness_summary_policy where singleton), 5, 'Public threshold is five');
select is((select recency_window from private.dog_friendliness_summary_policy where singleton), interval '12 months', 'Public cohort rolls over twelve months');
select is((select enabled from private.dog_friendliness_summary_policy where singleton), true, 'Inline public summary policy is active');

select * from finish();
rollback;
