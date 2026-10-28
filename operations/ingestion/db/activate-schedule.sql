-- Apply only after the exact source list and worker deployment have been verified.
-- This schedules already enabled sources; it does not add or enable a brand.
select cron.schedule('whool-ingest-review-daily','17 4 * * *','select whool_private.dispatch_ingest_jobs();');
