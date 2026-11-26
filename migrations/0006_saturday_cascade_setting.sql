-- Configuração para ativar/desativar o pulo automático da folga de sexta para sábado quando o sábado está em férias
ALTER TABLE settings ADD COLUMN saturday_vacation_cascade INTEGER NOT NULL DEFAULT 1;
