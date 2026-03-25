-- RBAC core tables and indexes

create table if not exists public.users (
  id uuid not null default gen_random_uuid (),
  email character varying(255) not null,
  full_name character varying(255) not null,
  username character varying(255) null,
  avatar_url text null,
  bio text null,
  website text null,
  location text null,
  date_of_birth date null,
  phone character varying(20) null,
  phone_number character varying(20) null,
  is_active boolean null default true,
  is_verified boolean null default false,
  role character varying(50) null default 'user'::character varying,
  institution_id character varying(255) null,
  is_super_admin boolean null default false,
  permissions jsonb null default '{}'::jsonb,
  preferences jsonb null default '{}'::jsonb,
  metadata jsonb null default '{}'::jsonb,
  profile_completed boolean null default false,
  last_login timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint users_pkey primary key (id),
  constraint users_email_key unique (email),
  constraint users_username_key unique (username),
  constraint users_institution_id_fkey foreign KEY (institution_id) references institutions (institution_code) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_users_institution on public.users using btree (institution_id) TABLESPACE pg_default;

create index IF not exists idx_users_email on public.users using btree (email) TABLESPACE pg_default;

create index IF not exists idx_users_username on public.users using btree (username) TABLESPACE pg_default;

create index IF not exists idx_users_role on public.users using btree (role) TABLESPACE pg_default;

create index IF not exists idx_users_is_active on public.users using btree (is_active) TABLESPACE pg_default;

create index IF not exists idx_users_institution_id on public.users using btree (institution_id) TABLESPACE pg_default;

create index IF not exists idx_users_created_at on public.users using btree (created_at) TABLESPACE pg_default;

create index IF not exists idx_users_last_login on public.users using btree (last_login) TABLESPACE pg_default;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_users_activity_log') then
    create trigger tr_users_activity_log
    after insert or delete or update on users for each row
    execute function log_user_activity ();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_users_updated_at') then
    create trigger tr_users_updated_at before update on users for each row
    execute function update_updated_at ();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'update_users_updated_at') then
    create trigger update_users_updated_at before update on users for each row
    execute function update_updated_at_column ();
  end if;
end $$;

create table if not exists public.roles (
  id uuid not null default gen_random_uuid (),
  name character varying(100) not null,
  description text null,
  is_system_role boolean null default false,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint roles_pkey primary key (id),
  constraint roles_name_key unique (name)
) TABLESPACE pg_default;

create index IF not exists idx_roles_name on public.roles using btree (name) TABLESPACE pg_default;

create index IF not exists idx_roles_is_active on public.roles using btree (is_active) TABLESPACE pg_default;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_roles_updated_at') then
    create trigger tr_roles_updated_at before update on roles for each row
    execute function update_updated_at ();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'update_roles_updated_at') then
    create trigger update_roles_updated_at before update on roles for each row
    execute function update_updated_at_column ();
  end if;
end $$;

create table if not exists public.permissions (
  id uuid not null default gen_random_uuid (),
  name character varying(100) not null,
  description text null,
  resource character varying(100) not null,
  action character varying(50) not null,
  is_active boolean null default true,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint permissions_pkey primary key (id),
  constraint permissions_name_key unique (name),
  constraint permissions_resource_action_key unique (resource, action)
) TABLESPACE pg_default;

create index IF not exists idx_permissions_name on public.permissions using btree (name) TABLESPACE pg_default;

create index IF not exists idx_permissions_resource on public.permissions using btree (resource) TABLESPACE pg_default;

create index IF not exists idx_permissions_action on public.permissions using btree (action) TABLESPACE pg_default;

create index IF not exists idx_permissions_is_active on public.permissions using btree (is_active) TABLESPACE pg_default;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'tr_permissions_updated_at') then
    create trigger tr_permissions_updated_at before update on permissions for each row
    execute function update_updated_at ();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'update_permissions_updated_at') then
    create trigger update_permissions_updated_at before update on permissions for each row
    execute function update_updated_at_column ();
  end if;
end $$;

create table if not exists public.role_permissions (
  id uuid not null default gen_random_uuid (),
  role_id uuid not null,
  permission_id uuid not null,
  granted_at timestamp with time zone null default now(),
  granted_by uuid null,
  constraint role_permissions_pkey primary key (id),
  constraint role_permissions_role_permission_key unique (role_id, permission_id),
  constraint role_permissions_granted_by_fkey foreign KEY (granted_by) references users (id),
  constraint role_permissions_permission_id_fkey foreign KEY (permission_id) references permissions (id) on delete CASCADE,
  constraint role_permissions_role_id_fkey foreign KEY (role_id) references roles (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_role_permissions_role_id on public.role_permissions using btree (role_id) TABLESPACE pg_default;

create index IF not exists idx_role_permissions_permission_id on public.role_permissions using btree (permission_id) TABLESPACE pg_default;


