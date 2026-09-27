-- Smarter-Home Schema Migration Script for Local Supabase

-- 1. homes table
CREATE TABLE IF NOT EXISTS public.homes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. home_tokens table
CREATE TABLE IF NOT EXISTS public.home_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. rooms table
CREATE TABLE IF NOT EXISTS public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    camera_type TEXT DEFAULT 'none',
    camera_ip TEXT,
    camera_username TEXT,
    camera_password TEXT,
    camera_stream_url TEXT,
    camera_enabled BOOLEAN DEFAULT true,
    light_gpio INTEGER,
    temp_gpio INTEGER,
    ac_gpio INTEGER,
    lights_power BOOLEAN DEFAULT false,
    ac_power BOOLEAN DEFAULT false,
    temperature NUMERIC,
    humidity NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. home_states table
CREATE TABLE IF NOT EXISTS public.home_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID NOT NULL,
    key TEXT NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT home_states_home_key_unique UNIQUE (home_id, key)
);

-- 5. family_members table
CREATE TABLE IF NOT EXISTS public.family_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    home_id UUID REFERENCES public.homes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'Resident',
    status TEXT DEFAULT 'Home',
    last_seen TEXT,
    via TEXT,
    accuracy NUMERIC DEFAULT 95.0,
    descriptor JSONB,
    photo_urls TEXT[],
    model_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. Grant Permissions to roles
GRANT ALL ON TABLE public.homes TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.home_tokens TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.rooms TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.home_states TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.family_members TO postgres, anon, authenticated, service_role;

-- 7. RLS Setup (Allow authenticated & service_role & anon local access)
ALTER TABLE public.homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public access homes" ON public.homes;
    CREATE POLICY "Public access homes" ON public.homes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access home_tokens" ON public.home_tokens;
    CREATE POLICY "Public access home_tokens" ON public.home_tokens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access rooms" ON public.rooms;
    CREATE POLICY "Public access rooms" ON public.rooms FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access home_states" ON public.home_states;
    CREATE POLICY "Public access home_states" ON public.home_states FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access family_members" ON public.family_members;
    CREATE POLICY "Public access family_members" ON public.family_members FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
END $$;

-- 8. Storage Buckets (snapshots, models)
INSERT INTO storage.buckets (id, name, public)
VALUES ('snapshots', 'snapshots', true)
ON CONFLICT (id) DO UPDATE SET public = true;

INSERT INTO storage.buckets (id, name, public)
VALUES ('models', 'models', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Public snapshots storage access" ON storage.objects;
    CREATE POLICY "Public snapshots storage access" ON storage.objects FOR ALL TO anon, authenticated USING (bucket_id IN ('snapshots', 'models')) WITH CHECK (bucket_id IN ('snapshots', 'models'));
END $$;
