-- =====================================================================
-- Phase 7B - private file storage for employee documents (run AFTER
-- phase7b_hr_profiles.sql). PDF / JPG / PNG up to 5 MB, files stored
-- under <employee id>/<file> so each employee can open only their own.
-- If this fails with "permission denied for schema storage", tell the
-- admin to run it from the Supabase dashboard instead.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-documents', 'employee-documents', false, 5242880, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

create policy emp_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents'
         and (public.has_perm('employee_documents', 'view')
              or (storage.foldername(name))[1] = public.my_employee_id()::text));
create policy emp_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents' and public.has_perm('employee_documents', 'create'));
create policy emp_docs_replace on storage.objects for update to authenticated
  using (bucket_id = 'employee-documents' and public.has_perm('employee_documents', 'update'));
create policy emp_docs_remove on storage.objects for delete to authenticated
  using (bucket_id = 'employee-documents' and public.has_perm('employee_documents', 'update'));

select 'phase7b storage ok' as status;
