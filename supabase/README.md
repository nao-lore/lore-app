# Supabase Setup (Planned)

## Overview
Lore currently uses localStorage for all data storage. This directory contains the planned migration to Supabase for:
- User authentication (email/OAuth)
- Cloud data storage and sync
- Multi-device support
- API key proxy (so users don't need their own AI API keys)

## Setup (when ready)
1. Create a Supabase project at https://supabase.com
2. Run `schema.sql` in the SQL editor
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Enable authentication providers in Supabase dashboard

## Migration Strategy
- Phase 1: Add Supabase as optional backend (localStorage fallback)
- Phase 2: Add authentication UI
- Phase 3: Sync localStorage data to Supabase on first login
- Phase 4: Default to Supabase for authenticated users

## Files
- `schema.sql` — Database schema with RLS policies
- `../src/storageAdapter.ts` — Storage abstraction layer
