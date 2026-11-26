-- Suporte a solicitações de folga livre (geradas pelo remanejamento automático quando o sábado tem férias aprovadas)
ALTER TABLE swap_requests ADD COLUMN is_open_swap INTEGER NOT NULL DEFAULT 0;
