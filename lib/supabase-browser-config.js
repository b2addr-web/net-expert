const isolated = process.env.NEXT_PUBLIC_INTAKE_ISOLATED === '1';

export const supabaseUrl = isolated
 ? process.env.NEXT_PUBLIC_SUPABASE_URL : 'https://uycntpxrfbqtxydhsbbi.supabase.co';
export const supabaseKey = isolated
 ? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY : 'sb_publishable_0bJpwk2KMJukl1twAELQZw_qFjVSe-k';
