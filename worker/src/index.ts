import { Hono } from "hono";
import { cors } from "hono/cors";
import { neon } from "@neondatabase/serverless";

type Env = { DATABASE_URL: string };

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
}));

const DEFAULT_JARS = [
  ["NEC", "Necessities (NEC)", 55, "#3b82f6", "Living expenses, rent, groceries, utilities, transportation (55%)"],
  ["FFA", "Financial Freedom (FFA)", 10, "#10b981", "Babylon Rule: Pay yourself first 10% for wealth-generating investments"],
  ["LTSS", "Long-term Savings (LTSS)", 10, "#8b5cf6", "Emergency fund, future large purchases, long-term goals (10%)"],
  ["EDU", "Education (EDU)", 10, "#f59e0b", "Self-development, courses, books, personal growth (10%)"],
  ["PLAY", "Play (PLAY)", 10, "#ec4899", "Entertainment, leisure, travel, dining out, relaxation (10%)"],
  ["GIVE", "Give (GIVE)", 5, "#06b6d4", "Charity, community support, gifts for family and friends (5%)"],
] as const;

function sqlFor(url: string) {
  return neon(url);
}

function dateOnly(input: string): Date {
  const match = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error("Invalid date. Use YYYY-MM-DD.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

async function initJars(url: string) {
  const sql = sqlFor(url);
  const count = await sql`SELECT COUNT(*)::int AS count FROM jars`;
  if (count[0]?.count === 0) {
    for (const jar of DEFAULT_JARS) {
      await sql`
        INSERT INTO jars (id, type, name, "targetPercentage", balance, color, description, "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${jar[0]}::"JarType", ${jar[1]}, ${jar[2]}, 0, ${jar[3]}, ${jar[4]}, NOW(), NOW())
        ON CONFLICT (type) DO NOTHING
      `;
    }
  }
}

async function todoWithSubtasks(url: string, todoId: string) {
  const sql = sqlFor(url);
  const todos = await sql`
    SELECT t.*,
      COALESCE(
        (SELECT json_agg(s ORDER BY s."createdAt")
         FROM (SELECT * FROM subtasks s2 WHERE s2."todoId" = t.id) s),
        '[]'::json
      ) AS subtasks
    FROM todos t
    WHERE t.id = ${todoId}
  `;
  return todos[0];
}

app.get("/", (c) => c.json({ status: "ok", service: "todo-list-api" }));


app.get("/todos", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const date = c.req.query("date");
  const month = c.req.query("month");
  const range = c.req.query("range");
  let rows: any[];

  if (date) {
    rows = await sql`
      SELECT t.*,
        COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId" = t.id), '[]'::json) AS subtasks
      FROM todos t
      WHERE t."targetDate" = ${dateOnly(date)}
      ORDER BY t."targetDate", t.priority DESC, t."createdAt" DESC
    `;
  } else if (month) {
    const [year, monthNumber] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    const end = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
    rows = await sql`
      SELECT t.*,
        COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId" = t.id), '[]'::json) AS subtasks
      FROM todos t
      WHERE t."targetDate" >= ${start} AND t."targetDate" <= ${end}
      ORDER BY t."targetDate", t.priority DESC, t."createdAt" DESC
    `;
  } else if (range === "today" || range === "past" || range === "future") {
    const now = dateOnly(new Date().toISOString().slice(0, 10));
    if (range === "today") rows = await sql`SELECT t.*, COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId"=t.id),'[]'::json) AS subtasks FROM todos t WHERE t."targetDate"=${now} ORDER BY t.priority DESC, t."createdAt" DESC`;
    else if (range === "past") rows = await sql`SELECT t.*, COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId"=t.id),'[]'::json) AS subtasks FROM todos t WHERE t."targetDate"<${now} ORDER BY t."targetDate", t.priority DESC, t."createdAt" DESC`;
    else rows = await sql`SELECT t.*, COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId"=t.id),'[]'::json) AS subtasks FROM todos t WHERE t."targetDate">${now} ORDER BY t."targetDate", t.priority DESC, t."createdAt" DESC`;
  } else {
    rows = await sql`
      SELECT t.*,
        COALESCE((SELECT json_agg(s ORDER BY s."createdAt") FROM subtasks s WHERE s."todoId" = t.id), '[]'::json) AS subtasks
      FROM todos t
      ORDER BY t."targetDate", t.priority DESC, t."createdAt" DESC
    `;
  }
  return c.json(rows);
});

app.get("/todos/:id", async (c) => {
  const todo = await todoWithSubtasks(c.env.DATABASE_URL, c.req.param("id"));
  return todo ? c.json(todo) : c.json({ message: "Todo not found" }, 404);
});

app.post("/todos", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  if (!body.title || !body.targetDate) return c.json({ message: "title and targetDate are required" }, 400);
  const rows = await sql`
    INSERT INTO todos (id, title, description, "targetDate", status, priority, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(), ${body.title}, ${body.description ?? null}, ${dateOnly(body.targetDate)},
      ${body.status ?? "PENDING"}::"TodoStatus", ${body.priority ?? "MEDIUM"}::"Priority", NOW(), NOW()
    )
    RETURNING id
  `;
  return c.json(await todoWithSubtasks(c.env.DATABASE_URL, rows[0].id), 201);
});

app.patch("/todos/:id", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  await sql`
    UPDATE todos SET
      title = COALESCE(${body.title ?? null}, title),
      description = CASE WHEN ${body.description !== undefined} THEN ${body.description ?? null} ELSE description END,
      "targetDate" = CASE WHEN ${body.targetDate !== undefined} THEN ${body.targetDate ? dateOnly(body.targetDate) : null} ELSE "targetDate" END,
      status = CASE WHEN ${body.status !== undefined} THEN ${body.status ?? null}::"TodoStatus" ELSE status END,
      priority = CASE WHEN ${body.priority !== undefined} THEN ${body.priority ?? null}::"Priority" ELSE priority END,
      "updatedAt" = NOW()
    WHERE id = ${c.req.param("id")}
  `;
  const todo = await todoWithSubtasks(c.env.DATABASE_URL, c.req.param("id"));
  return todo ? c.json(todo) : c.json({ message: "Todo not found" }, 404);
});

app.delete("/todos/:id", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  await sql`DELETE FROM todos WHERE id = ${c.req.param("id")}`;
  return c.json({ success: true });
});

app.post("/todos/:id/subtasks", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  if (!body.title) return c.json({ message: "title is required" }, 400);
  await sql`INSERT INTO subtasks (id, title, "isCompleted", "todoId", "createdAt", "updatedAt") VALUES (gen_random_uuid(), ${body.title}, ${body.isCompleted ?? false}, ${c.req.param("id")}, NOW(), NOW())`;
  return c.json(await todoWithSubtasks(c.env.DATABASE_URL, c.req.param("id")), 201);
});

app.patch("/todos/subtasks/:subtaskId/toggle", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const rows = await sql`UPDATE subtasks SET "isCompleted"=NOT "isCompleted", "updatedAt"=NOW() WHERE id=${c.req.param("subtaskId")} RETURNING "todoId"`;
  if (!rows[0]) return c.json({ message: "SubTask not found" }, 404);
  return c.json(await todoWithSubtasks(c.env.DATABASE_URL, rows[0].todoId));
});

app.delete("/todos/subtasks/:subtaskId", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const rows = await sql`DELETE FROM subtasks WHERE id=${c.req.param("subtaskId")} RETURNING "todoId"`;
  if (!rows[0]) return c.json({ message: "SubTask not found" }, 404);
  return c.json(await todoWithSubtasks(c.env.DATABASE_URL, rows[0].todoId));
});

app.get("/finance/jars", async (c) => {
  await initJars(c.env.DATABASE_URL);
  const sql = sqlFor(c.env.DATABASE_URL);
  const rows = await sql`
    SELECT j.*, (SELECT COUNT(*)::int FROM transactions t WHERE t."jarId"=j.id) AS "_count"
    FROM jars j
    ORDER BY j."targetPercentage" DESC
  `;
  return c.json(rows);
});

app.get("/finance/summary", async (c) => {
  await initJars(c.env.DATABASE_URL);
  const sql = sqlFor(c.env.DATABASE_URL);
  const jars = await sql`SELECT * FROM jars ORDER BY "targetPercentage" DESC`;
  const totalBalance = jars.reduce((sum: number, jar: any) => sum + Number(jar.balance), 0);
  const investmentAndSavings = jars.filter((jar: any) => ["FFA", "LTSS"].includes(jar.type)).reduce((sum: number, jar: any) => sum + Number(jar.balance), 0);
  const ffa = jars.find((jar: any) => jar.type === "FFA");
  return c.json({ totalBalance, investmentAndSavings, babylonAsset: ffa ? Number(ffa.balance) : 0, jars });
});

app.post("/finance/income/allocate", async (c) => {
  await initJars(c.env.DATABASE_URL);
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  if (typeof body.totalAmount !== "number" || body.totalAmount <= 0) return c.json({ message: "totalAmount must be a positive number" }, 400);
  const jars = await sql`SELECT * FROM jars`;
  const transactions = [];
  for (const jar of jars) {
    const amount = body.customAllocations?.[jar.type] ?? Math.round((body.totalAmount * Number(jar.targetPercentage)) / 100);
    if (amount > 0) {
      await sql`UPDATE jars SET balance=balance+${amount}, "updatedAt"=NOW() WHERE id=${jar.id}`;
      const tx = await sql`
        INSERT INTO transactions (id, "jarId", amount, type, category, note, "transactionDate", "createdAt")
        VALUES (gen_random_uuid(), ${jar.id}, ${amount}, 'INCOME'::"TransactionType", 'Income Allocation', ${body.note || `Income allocated to ${jar.name}`}, NOW(), NOW())
        RETURNING *
      `;
      transactions.push(tx[0]);
    }
  }
  return c.json({ success: true, totalAllocated: body.totalAmount, transactions }, 201);
});

app.post("/finance/expense", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  if (!body.jarType || typeof body.amount !== "number" || body.amount <= 0) return c.json({ message: "jarType and positive amount are required" }, 400);
  const jars = await sql`SELECT * FROM jars WHERE type=${body.jarType}::"JarType"`;
  if (!jars[0]) return c.json({ message: `Jar ${body.jarType} not found` }, 400);
  const updated = await sql`UPDATE jars SET balance=balance-${body.amount}, "updatedAt"=NOW() WHERE id=${jars[0].id} RETURNING balance`;
  const tx = await sql`
    INSERT INTO transactions (id, "jarId", amount, type, category, note, "transactionDate", "createdAt")
    VALUES (gen_random_uuid(), ${jars[0].id}, ${body.amount}, 'EXPENSE'::"TransactionType", ${body.category || "General Expense"}, ${body.note || ""}, ${body.transactionDate ? new Date(body.transactionDate) : new Date()}, NOW())
    RETURNING *
  `;
  return c.json({ transaction: tx[0], currentJarBalance: updated[0].balance, isOverspent: Number(updated[0].balance) < 0 }, 201);
});

app.patch("/finance/expense/:id", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const body = await c.req.json<any>();
  const existing = await sql`SELECT * FROM transactions WHERE id=${c.req.param("id")} AND type='EXPENSE'::"TransactionType"`;
  if (!existing[0]) return c.json({ message: "Expense not found" }, 400);
  const next = await sql`SELECT * FROM jars WHERE type=${body.jarType}::"JarType"`;
  if (!next[0]) return c.json({ message: `Jar ${body.jarType} not found` }, 400);
  await sql`
    INSERT INTO transaction_edits (id, "transactionId", snapshot, "editedAt")
    VALUES (gen_random_uuid(), ${existing[0].id}, ${JSON.stringify(existing[0])}::json, NOW())
  `;
  await sql`UPDATE jars SET balance=balance+${existing[0].amount} WHERE id=${existing[0].jarId}`;
  await sql`UPDATE jars SET balance=balance-${body.amount} WHERE id=${next[0].id}`;
  const tx = await sql`
    UPDATE transactions SET "jarId"=${next[0].id}, amount=${body.amount}, category=${body.category || "General Expense"}, note=${body.note || ""},
      "transactionDate"=${body.transactionDate ? new Date(body.transactionDate) : existing[0].transactionDate}
    WHERE id=${existing[0].id} RETURNING *
  `;
  return c.json(tx[0]);
});

app.get("/finance/transactions/:id/history", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const rows = await sql`SELECT * FROM transaction_edits WHERE "transactionId"=${c.req.param("id")} ORDER BY "editedAt" DESC`;
  return c.json(rows);
});

app.get("/finance/transactions", async (c) => {
  const sql = sqlFor(c.env.DATABASE_URL);
  const jarType = c.req.query("jarType");
  const limit = Math.min(Number.parseInt(c.req.query("limit") || "50", 10) || 50, 500);
  const rows = jarType
    ? await sql`SELECT t.*, row_to_json(j) AS jar FROM transactions t JOIN jars j ON j.id=t."jarId" WHERE j.type=${jarType}::"JarType" ORDER BY t."transactionDate" DESC LIMIT ${limit}`
    : await sql`SELECT t.*, row_to_json(j) AS jar FROM transactions t JOIN jars j ON j.id=t."jarId" ORDER BY t."transactionDate" DESC LIMIT ${limit}`;
  return c.json(rows);
});

export default app;
