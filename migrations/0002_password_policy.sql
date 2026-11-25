-- Adiciona controle de troca obrigatória de senha no primeiro acesso / após reset
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1;
