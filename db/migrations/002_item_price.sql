alter table items add column price text check (price is null or length(price) <= 40);
