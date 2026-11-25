-- Tabela de solicitações de troca de folga com dupla aprovação (colega + administrador)
CREATE TABLE IF NOT EXISTS swap_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  requester_date TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  target_date TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  target_status TEXT NOT NULL DEFAULT 'pending' CHECK (target_status IN ('pending', 'approved', 'rejected')),
  target_decided_at TEXT,
  admin_status TEXT NOT NULL DEFAULT 'pending' CHECK (admin_status IN ('pending', 'approved', 'rejected')),
  admin_decided_by INTEGER,
  admin_decided_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_decided_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_swap_requests_status ON swap_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swap_requests_users ON swap_requests(requester_id, target_id);
