-- 011_division_c_insert.sql
-- ---------------------------------------------------------------------
-- Fixes 010, which did not work.
--
-- 010 assumed a 'c' row existed and only needed reactivating, because
-- migration 004 refers to C among the divisions it retires. It does not
-- exist for volleyball — 004's reference was itself an UPDATE, so it
-- matched nothing then too, and nothing has ever inserted the row.
--
-- An UPDATE that matches no rows succeeds silently, which is why 010
-- reported success and changed nothing visible. 010 did do its other
-- half: masters is now rank 9 / order 90, which is what made the gap.
--
-- This one inserts, and is safe to run more than once.

insert into divisions (sport_id, slug, name, skill_rank, display_order, is_active, descriptor)
select s.id, 'c', 'C', 8, 8, true, 'Beginner'
  from sports s
 where s.slug = 'volleyball'
on conflict (sport_id, slug) do update
   set name          = excluded.name,
       skill_rank    = excluded.skill_rank,
       display_order = excluded.display_order,
       is_active     = excluded.is_active,
       descriptor    = excluded.descriptor;

-- Ladder, strongest to most casual:
--   Open(1) AAA(2) AA(3) A(4) BBB(5) BB(6) B(7) C(8), then Masters(9).
--
-- The descriptor 'Beginner' was written by Claude, not Tom. Every other
-- descriptor in this table came from him directly. Still needs confirming.
