-- Camp membership status: active member vs pending applicant.
ALTER TABLE "CampMember" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
