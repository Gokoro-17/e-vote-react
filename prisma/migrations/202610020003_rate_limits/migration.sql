CREATE TABLE "RateBucket" ("id" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 1, "resetAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RateBucket_pkey" PRIMARY KEY ("id"));
CREATE INDEX "RateBucket_resetAt_idx" ON "RateBucket"("resetAt");
