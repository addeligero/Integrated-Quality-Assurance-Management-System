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

-- Dedicated access flag: allows compliance matrix management without changing base role
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_taskforce BOOLEAN NOT NULL DEFAULT false;

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

-- Compliance-matrix editors include privileged users and taskforce-tagged users.
CREATE OR REPLACE FUNCTION public.can_manage_compliance_matrix()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.is_privileged_user()
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.status, true) = true
        AND COALESCE(p.is_taskforce, false) = true
    )
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

-- Allow all authenticated users to read profile rows so uploader name joins
-- (documents -> profiles) resolve consistently across staff-facing views.
DROP POLICY IF EXISTS "Authenticated users can read profiles for attribution" ON public.profiles;
CREATE POLICY "Authenticated users can read profiles for attribution"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);


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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    EXCEPTION WHEN others THEN
      NULL; -- table may already be in the publication
    END;
  END IF;
END;
$$;


-- ============================================================
-- TRIGGER: notify uploader when status changes (pending/approved/rejected)
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

  ELSIF NEW.status = 'pending' AND OLD.status != 'pending' THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, metadata)
    VALUES (
      NEW.user_id,
      'Document Processed',
      'Your document "' || NEW.file_name || '" has been processed and is now pending admin review.',
      'info',
      '/dashboard/upload',
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
-- TRIGGER: notify validators when a document becomes pending review
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_validators_on_pending_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR COALESCE(OLD.status, '') <> 'pending') THEN
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

DROP TRIGGER IF EXISTS on_document_pending_review ON public.documents;
CREATE TRIGGER on_document_pending_review
  AFTER INSERT OR UPDATE OF status ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_validators_on_pending_document();

DROP TRIGGER IF EXISTS on_new_document_uploaded ON public.documents;


-- ============================================================
-- APP SETTINGS TABLE  (system-wide configuration)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings — needed for login-time 2FA check
CREATE POLICY IF NOT EXISTS "Public read app settings"
ON public.app_settings
FOR SELECT
USING (true);

-- Default: 2FA not required
INSERT INTO public.app_settings (key, value)
VALUES ('two_factor_required', 'false')
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- ENABLE REALTIME on profiles (for immediate logout on deactivation)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN others THEN
      NULL; -- table may already be in the publication
    END;
  END IF;
END;
$$;


-- ============================================================
-- COMPLIANCE MATRIX TABLES
-- ============================================================

-- Main compliance items table
CREATE TABLE IF NOT EXISTS public.compliance_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accreditation TEXT NOT NULL,                     -- AACCUP | PICAB | COE | AUN-QA | ISO
  requirements  TEXT[] NOT NULL DEFAULT '{}',      -- selected criteria labels
  description   TEXT NOT NULL DEFAULT '',
  mandatory     TEXT[] NOT NULL DEFAULT '{}',
  enhancement   TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'pending'     -- met | pending | not_met
);

-- Rename description -> remarks for compliance_items.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compliance_items'
      AND column_name = 'description'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compliance_items'
      AND column_name = 'remarks'
  ) THEN
    ALTER TABLE public.compliance_items RENAME COLUMN description TO remarks;
  END IF;
END $$;

ALTER TABLE public.compliance_items
ADD COLUMN IF NOT EXISTS remarks TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compliance_items'
      AND column_name = 'description'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'compliance_items'
      AND column_name = 'remarks'
  ) THEN
    EXECUTE 'UPDATE public.compliance_items SET remarks = COALESCE(NULLIF(remarks, ''''), description)';
  END IF;
END $$;


-- Dynamic accreditation definitions table
CREATE TABLE IF NOT EXISTS public.compliance_accreditations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  name         TEXT NOT NULL UNIQUE,
  requirements TEXT[] NOT NULL DEFAULT '{}'
);

CREATE OR REPLACE FUNCTION public.handle_compliance_accreditations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_compliance_accreditations_updated_at ON public.compliance_accreditations;
CREATE TRIGGER set_compliance_accreditations_updated_at
  BEFORE UPDATE ON public.compliance_accreditations
  FOR EACH ROW EXECUTE FUNCTION public.handle_compliance_accreditations_updated_at();

CREATE OR REPLACE FUNCTION public.can_manage_compliance_accreditations()
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
      AND COALESCE(p.status, true) = true
      AND lower(p.role) = 'quams_coordinator'
  );
$$;

ALTER TABLE public.compliance_accreditations ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "compliance_accreditations_select"
ON public.compliance_accreditations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compliance_accreditations_insert" ON public.compliance_accreditations;
CREATE POLICY "compliance_accreditations_insert"
ON public.compliance_accreditations FOR INSERT TO authenticated
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_accreditations_update" ON public.compliance_accreditations;
CREATE POLICY "compliance_accreditations_update"
ON public.compliance_accreditations FOR UPDATE TO authenticated
USING (public.can_manage_compliance_accreditations())
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_accreditations_delete" ON public.compliance_accreditations;
CREATE POLICY "compliance_accreditations_delete"
ON public.compliance_accreditations FOR DELETE TO authenticated
USING (public.can_manage_compliance_accreditations());

-- Numbered category dictionary used by compliance document filtering.
-- Example rows: (1, 'VMGO'), (2, 'Program Educational Objectives (PEO)')
CREATE TABLE IF NOT EXISTS public.compliance_categories (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_compliance_categories_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_compliance_categories_updated_at ON public.compliance_categories;
CREATE TRIGGER set_compliance_categories_updated_at
  BEFORE UPDATE ON public.compliance_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_compliance_categories_updated_at();

ALTER TABLE public.compliance_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "compliance_categories_select"
ON public.compliance_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compliance_categories_insert" ON public.compliance_categories;
CREATE POLICY "compliance_categories_insert"
ON public.compliance_categories FOR INSERT TO authenticated
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_categories_update" ON public.compliance_categories;
CREATE POLICY "compliance_categories_update"
ON public.compliance_categories FOR UPDATE TO authenticated
USING (public.can_manage_compliance_accreditations())
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_categories_delete" ON public.compliance_categories;
CREATE POLICY "compliance_categories_delete"
ON public.compliance_categories FOR DELETE TO authenticated
USING (public.can_manage_compliance_accreditations());

-- Maps accreditation requirement numbers (e.g. AACCUP Area 2) to one or more
-- numbered categories (e.g. 4=Faculty).
CREATE TABLE IF NOT EXISTS public.compliance_requirement_categories (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accreditation_name TEXT NOT NULL,
  requirement_key    TEXT NOT NULL,
  category_id        INTEGER NOT NULL REFERENCES public.compliance_categories(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (accreditation_name, requirement_key, category_id),
  CONSTRAINT compliance_requirement_categories_accreditation_fk
    FOREIGN KEY (accreditation_name)
    REFERENCES public.compliance_accreditations(name)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_compliance_req_categories_lookup
  ON public.compliance_requirement_categories (accreditation_name, requirement_key);

ALTER TABLE public.compliance_requirement_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "compliance_requirement_categories_select"
ON public.compliance_requirement_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compliance_requirement_categories_insert" ON public.compliance_requirement_categories;
CREATE POLICY "compliance_requirement_categories_insert"
ON public.compliance_requirement_categories FOR INSERT TO authenticated
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_requirement_categories_update" ON public.compliance_requirement_categories;
CREATE POLICY "compliance_requirement_categories_update"
ON public.compliance_requirement_categories FOR UPDATE TO authenticated
USING (public.can_manage_compliance_accreditations())
WITH CHECK (public.can_manage_compliance_accreditations());

DROP POLICY IF EXISTS "compliance_requirement_categories_delete" ON public.compliance_requirement_categories;
CREATE POLICY "compliance_requirement_categories_delete"
ON public.compliance_requirement_categories FOR DELETE TO authenticated
USING (public.can_manage_compliance_accreditations());

INSERT INTO public.compliance_accreditations (name, requirements)
VALUES
  (
    'AACCUP',
    ARRAY[
      'Area 1 - Vision, Mission, Goals and Objectives',
      'Area 2 - Faculty',
      'Area 3 - Curriculum and Instruction',
      'Area 4 - Support to Students',
      'Area 5 - Research',
      'Area 6 - Extension and Community Involvement',
      'Area 7 - Library',
      'Area 8 - Physical Plant and Facilities',
      'Area 9 - Laboratories',
      'Area 10 - Administration'
    ]
  ),
  (
    'PICAB',
    ARRAY[
      '1.0 Background Information',
      '2.0 Institutional Summary',
      '3.0 Program Educational Objectives',
      '4.0 Program Outcomes (Student Outcomes)',
      '5.0 Curriculum',
      '6.0 Students',
      '7.0 Faculty',
      '8.0 Facilities',
      '9.0 Institutional Support',
      '10.0 Industry-Academe Linkage and Community Programs',
      '11.0 Program Improvement'
    ]
  ),
  (
    'COE',
    ARRAY[
      'Criterion 1 - Innovation Culture',
      'Criterion 2 - Staff Development Tradition',
      'Criterion 3 - Learner and Graduate Quality',
      'Criterion 4 - Culture of Research and Creativity',
      'Criterion 5 - International Outlook',
      'Criterion 6 - Service Orientation'
    ]
  ),
  (
    'AUN-QA',
    ARRAY[
      'Criterion 1 - University Information',
      'Criterion 2 - Programme Structure and Content',
      'Criterion 3 - Teaching and Learning Approach',
      'Criterion 4 - Academic Staff',
      'Criterion 5 - Academic Staff Support',
      'Criterion 6 - Student Support Services',
      'Criterion 7 - Facilities and Infrastructure',
      'Criterion 8 - Output and Outcomes'
    ]
  ),
  ('ISO', ARRAY[]::TEXT[])
ON CONFLICT (name) DO NOTHING;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_compliance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_compliance_updated_at ON public.compliance_items;
CREATE TRIGGER set_compliance_updated_at
  BEFORE UPDATE ON public.compliance_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_compliance_updated_at();

ALTER TABLE public.compliance_items ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read compliance items
CREATE POLICY IF NOT EXISTS "compliance_items_select"
ON public.compliance_items FOR SELECT TO authenticated USING (true);

-- Privileged users and taskforce members can insert / update / delete.
DROP POLICY IF EXISTS "compliance_items_insert" ON public.compliance_items;
CREATE POLICY "compliance_items_insert"
ON public.compliance_items FOR INSERT TO authenticated
WITH CHECK (public.can_manage_compliance_matrix());

DROP POLICY IF EXISTS "compliance_items_update" ON public.compliance_items;
CREATE POLICY "compliance_items_update"
ON public.compliance_items FOR UPDATE TO authenticated
USING (public.can_manage_compliance_matrix())
WITH CHECK (public.can_manage_compliance_matrix());

DROP POLICY IF EXISTS "compliance_items_delete" ON public.compliance_items;
CREATE POLICY "compliance_items_delete"
ON public.compliance_items FOR DELETE TO authenticated
USING (public.can_manage_compliance_matrix());


-- Join table: compliance_item → document (supporting evidence)
CREATE TABLE IF NOT EXISTS public.compliance_item_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_item_id  UUID NOT NULL REFERENCES public.compliance_items(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  UNIQUE (compliance_item_id, document_id)
);

ALTER TABLE public.compliance_item_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "compliance_item_docs_select"
ON public.compliance_item_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "compliance_item_docs_insert" ON public.compliance_item_documents;
CREATE POLICY "compliance_item_docs_insert"
ON public.compliance_item_documents FOR INSERT TO authenticated
WITH CHECK (public.can_manage_compliance_matrix());

DROP POLICY IF EXISTS "compliance_item_docs_delete" ON public.compliance_item_documents;
CREATE POLICY "compliance_item_docs_delete"
ON public.compliance_item_documents FOR DELETE TO authenticated
USING (public.can_manage_compliance_matrix());


-- View that joins compliance_items with their linked documents for easy querying
-- security_invoker = true ensures the view respects the caller's RLS policies
-- (prevents the view from bypassing RLS and exposing data to anonymous users)
CREATE OR REPLACE VIEW public.compliance_documents
WITH (security_invoker = true) AS
SELECT
  cid.compliance_item_id,
  cid.id,
  d.id       AS document_id,
  d.file_name,
  d.primary_category
FROM public.compliance_item_documents cid
JOIN public.documents d ON d.id = cid.document_id;

-- Restrict access: only authenticated users may query this view
REVOKE ALL ON public.compliance_documents FROM anon;
GRANT SELECT ON public.compliance_documents TO authenticated;

-- ============================================================
-- Upload durability: allow document owners to update their own rows
-- Needed so the upload flow can write OCR results back after
-- processing (status: 'processing' → 'pending') from the client.
-- The existing "documents_update_privileged_only" policy covers
-- admin review actions; this companion policy covers the uploader.
-- ============================================================
CREATE POLICY IF NOT EXISTS "documents_update_owner"
ON public.documents
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Enable Realtime for documents table so that status changes
-- (processing → pending, error, etc.) propagate to all subscribed
-- clients instantly — enabling cross-tab and cross-device UI sync.
-- ============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
    EXCEPTION WHEN others THEN NULL;  -- already added
    END;
  END IF;
END; $$;

