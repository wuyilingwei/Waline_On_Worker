import { Hono } from "hono";
import type { Env, Variables } from "../env.js";

export const articleRoutes = new Hono<{
	Bindings: Env;
	Variables: Variables;
}>();

// Valid counter fields to prevent SQL injection
const VALID_FIELDS = new Set([
	"time",
	"reaction0",
	"reaction1",
	"reaction2",
	"reaction3",
	"reaction4",
	"reaction5",
	"reaction6",
	"reaction7",
	"reaction8",
]);

/**
 * GET /api/article
 * Query params:
 *   - path / path[] (required): page path(s)
 *   - type / type[] (optional, default: ['time']): counter field(s)
 *
 * Response (follows Waline /api/ format):
 *   - single path: [{[type]: count}]
 *   - multiple paths: [{[type]: count}, …]
 */
articleRoutes.get("/", async (c) => {
	// Official @waline/client fetches counters as
	// `article?path=<path1>,<path2>&type=time,reaction0` (comma-joined single
	// params), while some embeds use `path[]`/`type[]`. Split values on commas
	// like the official server does.
	const paths = [
		...(c.req.queries("path") || []),
		...(c.req.queries("path[]") || []),
	]
		.flatMap((p: string) => p.split(","))
		.filter(Boolean);
	if (paths.length === 0) {
		return c.json({ errno: 0, errmsg: "", data: 0 });
	}

	const types = [
		...(c.req.queries("type") || []),
		...(c.req.queries("type[]") || []),
	]
		.flatMap((t: string) => t.split(","))
		.filter(Boolean);
	const validTypes = (types.length > 0 ? types : ["time"]).filter((t: string) =>
		VALID_FIELDS.has(t),
	);
	if (validTypes.length === 0) {
		return c.json({ errno: 0, errmsg: "", data: paths.map(() => ({})) });
	}

	const placeholders = paths.map(() => "?").join(",");
	const result = await c.env.DB.prepare(
		`SELECT * FROM wl_Counter WHERE url IN (${placeholders})`,
	)
		.bind(...paths)
		.all();

	const respObj: Record<string, any> = {};
	for (const row of result.results) {
		respObj[(row as any).url] = row;
	}

	const data = paths.map((url) => {
		const counters: Record<string, number> = {};
		for (const field of validTypes) {
			counters[field] = (respObj[url] as any)?.[field] || 0;
		}
		return counters;
	});

	return c.json({ errno: 0, errmsg: "", data });
});

/**
 * POST /api/article
 * Body: { path, type, action }
 *   - path: page path (maps to DB url column)
 *   - type: counter field (e.g. 'time', 'reaction0')
 *   - action: 'inc' | 'desc'
 */
articleRoutes.post("/", async (c) => {
	const body = await c.req.json();
	const { path, type = "time", action = "inc" } = body;

	if (!path) {
		return c.json({ errno: 1, errmsg: "path is required" }, 400);
	}

	if (!VALID_FIELDS.has(type)) {
		return c.json({ errno: 1, errmsg: "invalid type" }, 400);
	}

	const existing = await c.env.DB.prepare(
		"SELECT * FROM wl_Counter WHERE url = ?",
	)
		.bind(path)
		.first();

	if (!existing) {
		if (action === "desc") {
			return c.json({ errno: 0, errmsg: "", data: [{ [type]: 0 }] });
		}

		await c.env.DB.prepare(
			`INSERT INTO wl_Counter (url, ${type}) VALUES (?, 1)`,
		)
			.bind(path)
			.run();

		return c.json({ errno: 0, errmsg: "", data: [{ [type]: 1 }] });
	}

	const currentVal = (existing as any)[type] || 0;
	const newVal =
		action === "desc" ? Math.max(0, currentVal - 1) : currentVal + 1;

	await c.env.DB.prepare(
		`UPDATE wl_Counter SET ${type} = ?, updatedAt = datetime('now') WHERE url = ?`,
	)
		.bind(newVal, path)
		.run();

	return c.json({ errno: 0, errmsg: "", data: [{ [type]: newVal }] });
});
