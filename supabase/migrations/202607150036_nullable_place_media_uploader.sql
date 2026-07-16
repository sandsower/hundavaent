begin;

-- Uploader attribution is not part of the durable media identity. Keeping it nullable lets a
-- pre-launch recovery preserve approved media while disposable managed Auth rows are omitted.
alter table private.place_media alter column uploaded_by drop not null;

commit;
