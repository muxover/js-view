import http from "node:http";
import type { AddressInfo } from "node:net";

const pages: Record<string, string> = {
	"/spa": `<!doctype html><title>Store</title><div id="root">Loading...</div>
<script>
setTimeout(() => {
	fetch("/api/items").then((r) => r.json()).then((d) => {
		root.innerHTML = "<article><h1>Store</h1>" +
			d.items.map((i) => "<p>" + i.name + "</p>").join("") +
			'<a href="/item/1">First item</a><a href="https://other.test/x">Elsewhere</a></article>';
	});
}, 200);
</script>`,
	"/feed": `<!doctype html><title>Feed</title><main id="f"></main>
<script>
let n = 0;
function add() { for (let i = 0; i < 5; i++) { const p = document.createElement("p"); p.textContent = "Post " + (++n); f.append(p); } document.body.style.minHeight = (2000 + n * 200) + "px"; }
add();
addEventListener("scroll", () => { if (innerHeight + scrollY >= document.body.scrollHeight - 50 && n < 20) add(); });
</script>`,
	"/more": `<!doctype html><title>More</title><ul id="l"><li>one</li></ul>
<button class="load-more" onclick="l.insertAdjacentHTML('beforeend', '<li>two</li><li>three</li>')">Load more</button>`,
	"/challenge": `<!doctype html><title>Just a moment...</title><div id="challenge-running">Checking your browser.</div>`,
	"/login": `<!doctype html><title>Sign in</title><form><input name="user"><input type="password" name="pw"><button>Sign in</button></form>`,
	"/long": `<!doctype html><title>Long</title><article><h1>Long</h1>${Array.from(
		{ length: 400 },
		(_, i) =>
			`<p>Paragraph ${i} of a long article with enough words to count.</p>`,
	).join("")}</article>`,
	"/search": `<!doctype html><title>Search</title><form onsubmit="event.preventDefault(); out.textContent = 'Results for ' + q.value"><input id="q"></form><p id="out">No search yet</p>`,
	"/tags": `<!doctype html><title>Tags</title><p>Tagged: <span class="tag">alpha</span><span class="tag">beta</span><span class="tag">gamma</span></p>`,
	"/docs": `<!doctype html><title>Docs</title><nav><a href="/">Home</a><a href="/blog">Blog</a></nav>
<main><h1>Guide</h1><p>Install the tool, then run it against any page you want to read.</p>
<p>The second paragraph explains the flags in more detail for people who need them.</p></main>
<footer>footer text</footer>`,
};

export interface Site {
	url: (path: string) => string;
	close: () => Promise<void>;
}

export async function startSite(): Promise<Site> {
	const server = http.createServer((req, res) => {
		if (req.url === "/api/items") {
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify({ items: [{ name: "Apple" }, { name: "Banana" }] }),
			);
			return;
		}
		const page = pages[req.url ?? ""];
		res.statusCode = page ? 200 : 404;
		res.setHeader("content-type", "text/html");
		res.end(page ?? "<title>Not found</title><h1>Nothing here</h1>");
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	return {
		url: (path) => `http://127.0.0.1:${port}${path}`,
		close: () => new Promise((r) => server.close(() => r())),
	};
}

export interface Proxy {
	url: string;
	authorized: () => number;
	close: () => Promise<void>;
}

// An HTTP proxy that insists on basic auth and sends every request to the site,
// whatever host the browser asked for.
export async function startProxy(
	site: Site,
	user: string,
	pass: string,
): Promise<Proxy> {
	const expected = `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
	let authorized = 0;
	const server = http.createServer((req, res) => {
		if (req.headers["proxy-authorization"] !== expected) {
			res.writeHead(407, { "proxy-authenticate": 'Basic realm="test"' });
			res.end();
			return;
		}
		authorized += 1;
		const path = new URL(req.url ?? "/", "http://placeholder").pathname;
		http.get(site.url(path), (upstream) => {
			res.writeHead(upstream.statusCode ?? 502, upstream.headers);
			upstream.pipe(res);
		});
	});
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	const { port } = server.address() as AddressInfo;
	return {
		url: `http://${user}:${pass}@127.0.0.1:${port}`,
		authorized: () => authorized,
		close: () => new Promise((r) => server.close(() => r())),
	};
}
