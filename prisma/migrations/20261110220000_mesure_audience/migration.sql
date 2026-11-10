CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visit" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "target" TEXT,
    "label" TEXT,
    "zone" TEXT,
    "query" TEXT,
    "source" TEXT,
    "device" TEXT,
    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VisitEvent_at_idx" ON "VisitEvent"("at");
CREATE INDEX "VisitEvent_visit_at_idx" ON "VisitEvent"("visit", "at");
CREATE INDEX "VisitEvent_kind_at_idx" ON "VisitEvent"("kind", "at");
