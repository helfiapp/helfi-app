-- Migration: Add unsubscribe tracking to Waitlist table
-- Run this manually if Prisma migrate doesn't work due to DATABASE_URL

-- Add unsubscribed column (defaults to false)
ALTER TABLE "Waitlist" 
ADD COLUMN IF NOT EXISTS "unsubscribed" BOOLEAN NOT NULL DEFAULT false;

-- Add updatedAt column (auto-updated timestamp)
ALTER TABLE "Waitlist" 
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to auto-update updatedAt (if your database supports it)
-- For PostgreSQL:
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_waitlist_updated_at ON "Waitlist";
CREATE TRIGGER update_waitlist_updated_at
    BEFORE UPDATE ON "Waitlist"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

