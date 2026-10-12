"""Headless screenshot helper (Playwright + SwiftShader WebGL). Starts its own static server.

Usage:
  python dev/shot.py "dev/viewer.html?prop=owl_totem&hud=0" out.png [--size 1280x720] [--wait 0.5] [--js "VIEW.advance(2)"]
  python dev/shot.py "index.html?autotest=1" out.png --js "await RLP.goto('beach_mid')" --wait 2

Prints console errors / page errors; exits 1 if the page reported VIEW_ERROR or uncaught errors.
Multiple shots in one browser:  --batch spec.json  where spec.json = [{"url":..., "out":..., "js":..., "wait":...}, ...]
"""
import argparse, json, os, socket, sys, threading, time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def serve():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=ROOT))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def run(jobs, size):
    w, h = map(int, size.split("x"))
    httpd, port = serve()
    failed = False
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        for job in jobs:
            page = browser.new_page(viewport={"width": w, "height": h})
            msgs = []
            page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
            page.on("pageerror", lambda e: msgs.append(f"[pageerror] {e}"))
            url = f"http://127.0.0.1:{port}/{job['url'].lstrip('/')}"
            page.goto(url)
            try:
                page.wait_for_function("window.VIEW_READY === true || window.RLP?.ready === true", timeout=int(job.get("timeout", 60)) * 1000)
            except Exception as e:
                msgs.append(f"[timeout] page never became ready: {e}")
            if job.get("js"):
                try:
                    res = page.evaluate(f"(async () => {{ {job['js']} }})()")
                    if res is not None:
                        print("js result:", json.dumps(res, ensure_ascii=False)[:2000])
                except Exception as e:
                    msgs.append(f"[js error] {e}")
            time.sleep(float(job.get("wait", 0.3)))
            out = job["out"]
            os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
            page.screenshot(path=out)
            err = page.evaluate("window.VIEW_ERROR || null")
            if err:
                msgs.append(f"[VIEW_ERROR] {err}")
            bad = [m for m in msgs if m.startswith(("[error]", "[pageerror]", "[VIEW_ERROR]", "[timeout]", "[js error]"))]
            print(f"saved {out}" + (f"  ({len(bad)} errors)" if bad else ""))
            for m in msgs:
                print("   ", m[:500])
            failed = failed or bool(bad)
            page.close()
        browser.close()
    httpd.shutdown()
    return failed


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("url", nargs="?")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--size", default="1280x720")
    ap.add_argument("--wait", type=float, default=0.3)
    ap.add_argument("--js", default=None, help="async JS body evaluated after ready (may use await, may return a value)")
    ap.add_argument("--timeout", type=int, default=60)
    ap.add_argument("--batch", default=None)
    a = ap.parse_args()
    if a.batch:
        with open(a.batch, encoding="utf-8") as f:
            jobs = json.load(f)
    else:
        if not a.url or not a.out:
            ap.error("url and out are required unless --batch is used")
        jobs = [{"url": a.url, "out": a.out, "js": a.js, "wait": a.wait, "timeout": a.timeout}]
    sys.exit(1 if run(jobs, a.size) else 0)
