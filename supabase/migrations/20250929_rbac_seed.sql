-- Seed roles
insert into public.roles (name, description, is_system_role)
values
  ('admin','Full access', true),
  ('staff','Can view/create/edit operational data', false),
  ('viewer','Read-only access', false)
on conflict (name) do nothing;

-- Seed permissions (sample across key resources)
insert into public.permissions (name, description, resource, action)
values
  ('users.view','View users','users','view'),
  ('users.create','Create users','users','create'),
  ('users.edit','Edit users','users','edit'),
  ('users.delete','Delete users','users','delete'),
  ('institutions.view','View institutions','institutions','view'),
  ('institutions.create','Create institutions','institutions','create'),
  ('institutions.edit','Edit institutions','institutions','edit'),
  ('institutions.delete','Delete institutions','institutions','delete'),
  ('batches.view','View batches','batches','view'),
  ('batches.create','Create batches','batches','create'),
  ('batches.edit','Edit batches','batches','edit'),
  ('batches.delete','Delete batches','batches','delete'),
  ('programs.view','View programs','programs','view'),
  ('programs.create','Create programs','programs','create'),
  ('programs.edit','Edit programs','programs','edit'),
  ('programs.delete','Delete programs','programs','delete')
on conflict (name) do nothing;

-- Map admin -> all permissions
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.name = 'admin'
on conflict (role_id, permission_id) do nothing;

-- Map staff -> non-destructive create/edit/view for core entities
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on (
  (p.resource in ('institutions','batches','programs') and p.action in ('view','create','edit'))
  or (p.resource = 'users' and p.action in ('view'))
)
where r.name = 'staff'
on conflict (role_id, permission_id) do nothing;

-- Map viewer -> view only
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.action = 'view'
where r.name = 'viewer'
on conflict (role_id, permission_id) do nothing;


