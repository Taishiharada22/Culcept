alter table if exists public.user_body_avatar_profiles
    add column if not exists person_cutout_url text,
    add column if not exists clothes_cutout_url text,
    add column if not exists mask_clothes_url text,
    add column if not exists turntable_gif_url text,
    add column if not exists mesh_glb_url text;
