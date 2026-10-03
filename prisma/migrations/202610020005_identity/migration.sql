ALTER TABLE "User" ADD COLUMN "identityHash" TEXT;
CREATE UNIQUE INDEX "User_identityHash_key" ON "User"("identityHash");
ALTER TABLE "VoterEligibility" ADD COLUMN "rulesApproved" BOOLEAN NOT NULL DEFAULT false;
