-- 021_confidence_score.sql
-- ---------------------------------------------------------------------
-- How likely is this one to convert?
--
-- Tom, 9 Nov. The pipeline status says where a conversation has got to.
-- It cannot say whether it is going anywhere. Two organizers can both
-- sit at 'in conversation' while one is a layup and the other is a long
-- shot, and the stage cannot tell them apart. This can.
--
-- Six steps, and every one of them is named. That matters more than the
-- count: an unlabelled 0-10 has no definition for the gap between 6 and
-- 7, so the same organizer rated in March and in November gets two
-- different numbers and a "7 and above" filter quietly becomes noise.
-- Named steps mean the same thing every time.
--
--   0  Disqualified     3  Coin Toss
--   1  Slim Chance      4  Promising
--   2  Flimsy           5  Victorious
--
-- Null is not zero. Null means nobody has judged it yet, which is the
-- state of all 1,581 records right now; 0 is the considered opinion that
-- this one is dead. Collapsing those two would overstate how much of the
-- directory has actually been worked.
-- ---------------------------------------------------------------------

begin;

-- `confidence` on this table already means something else entirely --
-- how reliable the RESEARCH is (verified / partial / inferred / unknown),
-- carried over from the directory import. Two meanings of one word in
-- one table is a trap for whoever reads this next, so the old one takes
-- the more accurate name and the new one gets the plain one.
alter table organizer_private rename column confidence to research_confidence;

comment on column organizer_private.research_confidence is
  'How reliable this RECORD is -- verified, partial, inferred, unknown. About the data, not the deal. Renamed from `confidence` on 9 Nov when confidence_score arrived.';

alter table organizer_private
  add column if not exists confidence_score smallint
    check (confidence_score is null or confidence_score between 0 and 5);

comment on column organizer_private.confidence_score is
  'How likely this organization is to convert, 0 Disqualified to 5 Victorious. Null means not yet judged, which is different from 0: null is unworked, 0 is a decision.';

-- Partial, because the overwhelming majority are null and a filter on
-- this will always be asking for the ones that are not.
create index if not exists organizer_private_confidence_idx
  on organizer_private (confidence_score)
  where confidence_score is not null;

commit;
