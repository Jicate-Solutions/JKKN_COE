-- Question-paper images (diagrams / figures attached to a single question or
-- sub-division of an IA question paper).
--
-- Uploads go through app/api/pre-exam/question-papers/[id]/image using the
-- service-role key, which bypasses RLS — so no INSERT/UPDATE/DELETE policy is
-- granted here. Reads are public so both the authoring UI and the headless
-- Chromium PDF renderer can load an image by URL without a signed request.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
	'question-images',
	'question-images',
	true,
	5242880, -- 5 MB, matches MAX_FILE_SIZE in the upload route
	array['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
on conflict (id) do update
	set public = excluded.public,
		file_size_limit = excluded.file_size_limit,
		allowed_mime_types = excluded.allowed_mime_types;

-- Explicit public read. The bucket is public (objects are served without a
-- token), but the policy keeps direct client reads/listing consistent.
drop policy if exists "question_images_public_read" on storage.objects;
create policy "question_images_public_read"
	on storage.objects for select
	to public
	using (bucket_id = 'question-images');
