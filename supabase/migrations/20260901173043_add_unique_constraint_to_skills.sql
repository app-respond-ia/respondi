-- Add unique constraint to skills table on branch_id and skill_global_id
ALTER TABLE "public"."skills" ADD CONSTRAINT "skills_branch_id_skill_global_id_key" UNIQUE ("branch_id", "skill_global_id");
