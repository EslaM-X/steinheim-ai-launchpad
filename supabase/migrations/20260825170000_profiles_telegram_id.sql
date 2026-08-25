-- Allow the bot to link Telegram users to profiles for approval tracking.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_id TEXT;

-- Unique: one Telegram account per profile.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_id ON public.profiles(telegram_id) WHERE telegram_id IS NOT NULL;
