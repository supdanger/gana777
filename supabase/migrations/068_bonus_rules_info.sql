-- Guarda las condiciones que se muestran en el botón de información de cada bono.
begin;

alter table public.promotions add column rules_text text not null default '';
alter table public.promotions add constraint promotions_rules_text_length check (length(rules_text) <= 2000);

commit;
