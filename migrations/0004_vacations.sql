-- Tabela de solicitações e agendamentos de férias
CREATE TABLE IF NOT EXISTS vacation_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days_count INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_by INTEGER NOT NULL,
  admin_decided_by INTEGER,
  admin_decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_decided_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vacation_requests_dates ON vacation_requests(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_vacation_requests_employee ON vacation_requests(employee_id, status);
