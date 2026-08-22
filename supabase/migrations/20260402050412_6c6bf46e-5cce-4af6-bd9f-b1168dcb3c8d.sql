-- Atualizar o horário do cron "evening" de 19h para 20h (horário de Manaus)
-- 20h Manaus = 00:00 UTC (dia seguinte)
SELECT cron.alter_job(5, schedule := '0 0 * * *');
