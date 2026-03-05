-- Add avatar column to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS avatar TEXT;

-- Add username and extension columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS extension TEXT; -- e.g. Dr., Prof., Mr., Mrs., Ms., Engr., Atty.

-- Store the auth email in profiles for username → sign-in lookup
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on username for fast lookups during login
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles (username);

-- Add updated_at column to documents table and auto-update it on row changes
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Update the trigger function to handle updates
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    f_name,
    l_name,
    role,
    status
  )
  VALUES (
    new.id,
    '',        -- can be updated later
    '',
    'user',    -- default role
    true
  );
  RETURN new;
END;
$$;

-- Create trigger if it doesn't exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Allow users to view their own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Allow users to update their own profile (avatar, names)
CREATE POLICY IF NOT EXISTS "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id 
  AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
);

-- Admins can manage all profiles
CREATE POLICY IF NOT EXISTS "Admins can manage profiles"
ON public.profiles
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
    AND p.role = 'admin'
  )
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- bypasses RLS when reading profiles. Without this, calling it inside a profiles

CREATE OR REPLACE FUNCTION public.is_privileged_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(p.role) IN (
        'admin',
        'dean',
        'associate_dean',
        'quams_coordinator',
        'department'
      )
      AND COALESCE(p.status, true) = true
  );
$$;

-- Uses is_privileged_user() which is SECURITY DEFINER — no recursion.
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;

CREATE POLICY "Privileged users can read all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_privileged_user());

CREATE POLICY "Privileged users can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_privileged_user())
WITH CHECK (public.is_privileged_user());


-- ============================================================
-- DOCUMENTS TABLE — RLS POLICIES
-- ============================================================

-- All authenticated users can read every document
CREATE POLICY "documents_select_all_authenticated"
ON public.documents
FOR SELECT
TO authenticated
USING (true);

-- Any authenticated user can upload (insert) their own document row
CREATE POLICY "documents_insert_authenticated"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Only privileged roles (admin / dean / associate_dean / quams_coordinator / department)
-- can approve, reject, or reclassify documents
CREATE POLICY "documents_update_privileged_only"
ON public.documents
FOR UPDATE
TO authenticated
USING (public.is_privileged_user())
WITH CHECK (public.is_privileged_user());

-- Only privileged roles can delete document rows
CREATE POLICY "documents_delete_privileged_only"
ON public.documents
FOR DELETE
TO authenticated
USING (public.is_privileged_user());


-- ============================================================
-- STORAGE BUCKET — POLICIES  (bucket name: "documents")
-- ============================================================

-- All authenticated users can view / download any file
CREATE POLICY "storage_select_all_authenticated_documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Any authenticated user can upload files
CREATE POLICY "storage_insert_authenticated_documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Only privileged roles can delete files
CREATE POLICY "storage_delete_privileged_only_documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.is_privileged_user()
);


-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'info',   -- info | success | warning | error
  read        BOOLEAN NOT NULL DEFAULT false,
  link        TEXT,
  metadata    JSONB
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- DB trigger functions (SECURITY DEFINER) insert notifications — allow all inserts
CREATE POLICY "Service can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Users can dismiss / delete their own notifications
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (auth.uid() = user_id);


-- ============================================================
-- TRIGGER: notify uploader when their document is approved/rejected
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_on_document_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, metadata)
    VALUES (
      NEW.user_id,
      'Document Approved',
      'Your document "' || NEW.file_name || '" has been approved.',
      'success',
      '/dashboard/repository',
      jsonb_build_object('document_id', NEW.id, 'file_name', NEW.file_name)
    );

  ELSIF NEW.status = 'rejected' AND OLD.status != 'rejected' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, metadata)
    VALUES (
      NEW.user_id,
      'Document Rejected',
      'Your document "' || NEW.file_name || '" has been rejected.',
      'error',
      '/dashboard/upload',
      jsonb_build_object('document_id', NEW.id, 'file_name', NEW.file_name)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_document_status_change ON public.documents;
CREATE TRIGGER on_document_status_change
  AFTER UPDATE OF status ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_document_status_change();


-- ============================================================
-- TRIGGER: notify validators when a new document is uploaded (pending)
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_validators_on_new_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, metadata)
    SELECT
      p.id,
      'New Document Pending Review',
      'A new document "' || NEW.file_name || '" needs your review.',
      'warning',
      '/dashboard/classification',
      jsonb_build_object('document_id', NEW.id, 'file_name', NEW.file_name)
    FROM public.profiles p
    WHERE lower(p.role) IN ('admin', 'dean', 'quams_coordinator', 'associate_dean', 'department')
      AND p.status = TRUE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_new_document_uploaded ON public.documents;
CREATE TRIGGER on_new_document_uploaded
  AFTER INSERT ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_validators_on_new_document();

