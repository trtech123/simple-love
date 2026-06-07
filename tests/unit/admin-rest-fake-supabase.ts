export type FakeAdminUser = null | {
  id: string;
  app_metadata?: Record<string, unknown>;
};

export type FakeAdminRestState = {
  user: FakeAdminUser;
  tables: Record<string, Record<string, unknown>[]>;
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  rpcErrors: Record<string, { message: string } | null>;
  tableErrors: Record<string, { message: string } | null>;
  ids: Record<string, number>;
};

export function createAdminRestState(): FakeAdminRestState {
  return {
    user: { id: "admin-1", app_metadata: { role: "admin" } },
    tables: {
      admin_audit_logs: [],
    },
    rpcCalls: [],
    rpcErrors: {},
    tableErrors: {},
    ids: {},
  };
}

export function createFakeAdminSupabase(state: FakeAdminRestState) {
  return {
    from(table: string) {
      if (!state.tables[table]) {
        state.tables[table] = [];
      }
      return createTableBuilder(state, table);
    },
    async rpc(name: string, args: Record<string, unknown>) {
      state.rpcCalls.push({ name, args });
      return { error: state.rpcErrors[name] ?? null };
    },
  };
}

function createTableBuilder(state: FakeAdminRestState, table: string) {
  const filters: { column: string; value: unknown; op: "eq" | "in" }[] = [];
  let insertPayload: unknown;
  let updatePayload: Record<string, unknown> | null = null;
  let orderColumn = "";
  let descending = false;
  let limitCount: number | null = null;

  const builder = {
    select() {
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push({ column, value, op: "eq" });
      return builder;
    },
    in(column: string, value: unknown[]) {
      filters.push({ column, value, op: "in" });
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orderColumn = column;
      descending = options?.ascending === false;
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    insert(payload: unknown) {
      insertPayload = payload;
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        if (!record.id && table !== "admin_audit_logs") {
          record.id = nextId(state, table);
        }
        state.tables[table].push(record);
      }
      return builder;
    },
    upsert(payload: unknown) {
      insertPayload = payload;
      const record = payload as Record<string, unknown>;
      const productKey = record.product_key;
      const existing = state.tables[table].find((row) => row.product_key === productKey);
      if (existing) {
        Object.assign(existing, record);
      } else {
        state.tables[table].push(record);
      }
      return builder;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return builder;
    },
    async maybeSingle() {
      const error = state.tableErrors[table] ?? null;
      if (error) return { data: null, error };
      applyUpdateIfNeeded();
      return { data: queryRows()[0] ?? null, error: null };
    },
    async single() {
      const error = state.tableErrors[table] ?? null;
      if (error) return { data: null, error };
      applyUpdateIfNeeded();
      if (insertPayload && !Array.isArray(insertPayload)) {
        return { data: insertPayload as Record<string, unknown>, error: null };
      }
      return { data: queryRows()[0] ?? null, error: null };
    },
    async returns() {
      const error = state.tableErrors[table] ?? null;
      if (error) return { data: [], error };
      applyUpdateIfNeeded();
      return { data: queryRows(), error: null };
    },
    then(resolve: (value: { data?: Record<string, unknown>[]; error: { message: string } | null }) => unknown) {
      const error = state.tableErrors[table] ?? null;
      if (!error) {
        applyUpdateIfNeeded();
      }
      return Promise.resolve({ data: error ? undefined : queryRows(), error }).then(resolve);
    },
  };

  function queryRows() {
    let rows = state.tables[table].filter((row) =>
      filters.every((filter) => {
        const value = readColumn(row, filter.column);
        return filter.op === "eq"
          ? value === filter.value
          : Array.isArray(filter.value) && filter.value.includes(value);
      }),
    );

    if (orderColumn) {
      rows = [...rows].sort((left, right) => {
        const leftValue = readColumn(left, orderColumn) as string | number;
        const rightValue = readColumn(right, orderColumn) as string | number;
        if (leftValue === rightValue) return 0;
        return descending ? (leftValue < rightValue ? 1 : -1) : leftValue > rightValue ? 1 : -1;
      });
    }

    return limitCount === null ? rows : rows.slice(0, limitCount);
  }

  function applyUpdateIfNeeded() {
    if (!updatePayload) return;
    for (const row of queryRows()) {
      Object.assign(row, updatePayload);
    }
    updatePayload = null;
  }

  return builder;
}

function readColumn(row: Record<string, unknown>, column: string) {
  if (column.includes("->>")) {
    const [root, key] = column.split("->>");
    const value = row[root];
    return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  }

  return row[column];
}

function nextId(state: FakeAdminRestState, table: string) {
  state.ids[table] = (state.ids[table] ?? 0) + 1;
  return `${table}-${state.ids[table]}`;
}

export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
