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
