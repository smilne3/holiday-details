# Off-list gifts live in their own table, not as a column on items

An off-list gift is one a buyer adds to someone's list, which everyone but that person sees (#21). It is kept in its own `off_list_gifts` table, not as an `items` row marked by an `added_by` column, because the table fails closed. The queries that read a list owner's items for that owner (their own list, their home page's count) never read the new table, so a query that forgets off-list gifts hides them rather than showing one to the only person who mustn't see it. With a column, every one of those queries, and every one written later, would have to remember `added_by is null`.

A rollback stays safe the same way. Code from before this change never reads the table, so off-list gifts stay invisible. With a column, the old list query would show every off-list gift to the person it's for.

## Consequences

- The buyer is a column on the gift's row, not a row in `claims`. Taking it back deletes the row, so an off-list gift is never unclaimed, and `claims` is unchanged.
- The reads that must include it are the ones for someone else: another person's list, Gifts I'm buying, and the home page's gifts count. The organizer's delete check must also count it, as it counts items and claims.
