-- Pin every Unison function to an empty search_path (Supabase security lint
-- 0011). All references in the functions are already schema-qualified, and
-- built-ins resolve through pg_catalog, which is always searched.
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'unison'
  loop
    execute format('alter function %s set search_path = %L', fn, '');
  end loop;
end $$;
