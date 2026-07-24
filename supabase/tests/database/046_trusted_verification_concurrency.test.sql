begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(5);

select ok(
  position(
    'private.lock_member_qualifying_activity(actor_id)'
    in pg_get_functiondef(
      'public.submit_trusted_verification_task(text,jsonb,jsonb,text,uuid)'::regprocedure
    )
  ) > 0,
  'Trusted Verification uses the shared per-Member qualifying-activity lock'
);

select ok(
  position(
    'trusted-verification-task:'
    in pg_get_functiondef(
      'private.accept_trusted_verification_contribution()'::regprocedure
    )
  ) > 0,
  'Contribution confirmation serializes every contender for one exact Trusted task'
);

select extensions.dblink_connect(
  'trusted_verification_lock_holder',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);
select extensions.dblink_connect(
  'trusted_verification_lock_contender',
  'host=db port=5432 dbname=postgres user=postgres password=postgres sslmode=disable'
);

select ok(
  extensions.dblink_send_query(
    'trusted_verification_lock_holder',
    $holder$
      do $block$
      begin
        perform private.lock_member_qualifying_activity(
          '94900000-0000-4000-8000-000000000099'
        );
        perform pg_catalog.pg_sleep(1);
      end
      $block$;
    $holder$
  ) = 1,
  'One independent transaction holds the Trusted Member activity lock'
);

select pg_catalog.pg_sleep(0.2);

select ok(
  extensions.dblink_send_query(
    'trusted_verification_lock_contender',
    $contender$
      select private.lock_member_qualifying_activity(
        '94900000-0000-4000-8000-000000000099'
      );
    $contender$
  ) = 1,
  'A second transaction attempts activity for the same Trusted Member'
);

select pg_catalog.pg_sleep(0.2);

select is(
  extensions.dblink_is_busy('trusted_verification_lock_contender'),
  1,
  'Concurrent Trusted Member activity serializes until the first transaction commits'
);

select *
from extensions.dblink_get_result(
  'trusted_verification_lock_holder',
  false
) as result(status text);
select *
from extensions.dblink_get_result(
  'trusted_verification_lock_contender',
  false
) as result(status text);
select *
from extensions.dblink_get_result(
  'trusted_verification_lock_holder',
  false
) as result(status text);
select *
from extensions.dblink_get_result(
  'trusted_verification_lock_contender',
  false
) as result(status text);

select extensions.dblink_disconnect('trusted_verification_lock_holder');
select extensions.dblink_disconnect('trusted_verification_lock_contender');

select * from finish();

rollback;
