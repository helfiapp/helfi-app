-- Add business registration number to practitioner listings
ALTER TABLE "PractitionerListing"
ADD COLUMN "businessRegistrationNumber" TEXT;
