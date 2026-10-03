ALTER TABLE "Organization" ADD COLUMN "suspended" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ElectionActivity" ("electionId" TEXT NOT NULL, "hour" TIMESTAMP(3) NOT NULL, "submissions" INTEGER NOT NULL DEFAULT 1, CONSTRAINT "ElectionActivity_pkey" PRIMARY KEY ("electionId", "hour"));
ALTER TABLE "ElectionActivity" ADD CONSTRAINT "ElectionActivity_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
