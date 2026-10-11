-- The unused prototype users table must not retain a plaintext password field.
alter table public.users drop column if exists password;
