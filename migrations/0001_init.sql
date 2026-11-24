-- Tabela de usuários (funcionárias e administradores)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
  in_rotation INTEGER NOT NULL DEFAULT 1,
  rotation_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#0F766E',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configurações gerais da lotérica
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  shop_name TEXT NOT NULL DEFAULT 'Lotérica',
  open_time TEXT NOT NULL DEFAULT '10:00',
  close_time TEXT NOT NULL DEFAULT '19:00',
  lunch_hours REAL NOT NULL DEFAULT 1,
  daily_hours REAL NOT NULL DEFAULT 8,
  rotation_start_date TEXT NOT NULL DEFAULT '2026-11-23'
);

INSERT OR IGNORE INTO settings (id, shop_name, open_time, close_time, lunch_hours, daily_hours, rotation_start_date)
VALUES (1, 'Lotérica', '10:00', '19:00', 1, 8, '2026-11-23');

-- Feriados personalizados ou alterações em feriados oficiais (BR / Belo Horizonte)
CREATE TABLE IF NOT EXISTS holiday_overrides (
  date TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_closed INTEGER NOT NULL DEFAULT 1,
  is_custom INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Exceções manuais na escala (ex: troca de folga, folga extra, trabalho no dia da folga)
CREATE TABLE IF NOT EXISTS schedule_overrides (
  date TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('off', 'work')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, employee_id),
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Ajustes manuais de horas (privado por funcionária — visível apenas para ela e admin)
CREATE TABLE IF NOT EXISTS hour_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  employee_id INTEGER NOT NULL,
  hours_delta REAL NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_overrides_date ON schedule_overrides(date);
CREATE INDEX IF NOT EXISTS idx_hour_adjustments_emp_date ON hour_adjustments(employee_id, date);
