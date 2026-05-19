create table public.invitations (
  id uuid not null default gen_random_uuid (),
  email text not null,
  name text not null default ''::text,
  roles user_role[] not null default array['client'::user_role],
  project_ids uuid[] not null default '{}'::uuid[],
  invited_by uuid null,
  token text not null default encode(extensions.gen_random_bytes (32), 'hex'::text),
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone not null default (now() + '7 days'::interval),
  constraint invitations_pkey primary key (id),
  constraint invitations_token_key unique (token),
  constraint invitations_invited_by_fkey foreign KEY (invited_by) references profiles (id) on delete set null,
  constraint invitations_status_check check (
    (
      status = any (
        array[
          'pending'::text,
          'accepted'::text,
          'expired'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;