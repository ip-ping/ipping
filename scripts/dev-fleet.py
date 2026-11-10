"""A pretend fleet for developing and testing the interface: 16 nodes around the world speaking node
protocol v1, answering ping / tcp / http / traceroute / dns / tls with physically plausible numbers.
NOT FOR PRODUCTION: it enrols itself with a fixed setup token and a fixed administrator password.

    IPPING_SETUP_TOKEN=e2e-token ipping-backend serve        # a backend with that setup token
    python3 scripts/dev-fleet.py                              # needs: pip install websockets

Environment: IPPING_BACKEND (default http://127.0.0.1:18010), FLEET_CREDS (where node credentials are kept
between runs, default /tmp/fleet-creds.json).

Names the simulation treats specially, to give the interface something to show: example.org (a real name, because the backend
resolves a name itself before it lets the nodes have it, so a made-up one is refused) is geo-DNS: the nodes east of 60 degrees
longitude get a server in Singapore from it and the others one in Frankfurt (as they do when each node resolves it, which is
the default, or when one node resolves it for the rest); a DNS name that starts with "nx-" does not exist; one that starts with "split-" is mid-change (nodes in Asia still hold the old record, and
one node's own resolver times out); 1.1.1.1 and 8.8.8.x behave like anycast (every node is a few ms away).
"""
import asyncio, datetime, hashlib, http.cookiejar, json, math, random, sys, urllib.request, urllib.error
from websockets.asyncio.client import connect

import os
B = os.environ.get("IPPING_BACKEND", "http://127.0.0.1:18010").rstrip("/"); WS = B.replace("http", "ws", 1) + "/api/v1/nodes/connect"
CREDS = os.environ.get("FLEET_CREDS", "/tmp/fleet-creds.json")
NODES = [
    ("Amsterdam", "NL", 52.37, 4.90, "Hetzner"), ("Frankfurt", "DE", 50.11, 8.68, "OVH"), ("London", "GB", 51.51, -0.13, "DigitalOcean"),
    ("Madrid", "ES", 40.42, -3.70, "Contabo"), ("Stockholm", "SE", 59.33, 18.07, "Bahnhof"), ("New York", "US", 40.71, -74.0, "Vultr"),
    ("Chicago", "US", 41.88, -87.63, "Linode"), ("Dallas", "US", 32.78, -96.80, "Vultr"), ("Los Angeles", "US", 34.05, -118.24, "Linode"),
    ("Sao Paulo", "BR", -23.55, -46.63, "Vultr"), ("Johannesburg", "ZA", -26.2, 28.05, "Afrihost"), ("Mumbai", "IN", 19.08, 72.88, "Vultr"),
    ("Singapore", "SG", 1.35, 103.82, "DigitalOcean"), ("Tokyo", "JP", 35.68, 139.69, "Vultr"), ("Sydney", "AU", -33.87, 151.21, "Vultr"),
    ("Dubai", "AE", 25.2, 55.27, "Equinix"),
    ("Lisbon", "PT", 38.72, -9.14, "Home fibre"),  # a volunteer's node: a community node, never verified
]
COMMUNITY = {"Lisbon"}
GEO_NAME = "example.org"
TARGETS = [("New York", 40.71, -74.0), ("Frankfurt", 50.11, 8.68), ("Singapore", 1.35, 103.82), ("Sydney", -33.87, 151.21), ("Sao Paulo", -23.55, -46.63), ("Tokyo", 35.68, 139.69)]
jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)); csrf = ""
def call(m, p, b=None, anon=False):
    r = urllib.request.Request(B + p, method=m, data=None if b is None else json.dumps(b).encode(), headers={"Content-Type": "application/json", "X-CSRF-Token": csrf})
    with op.open(r, timeout=20) as x: raw = x.read(); return json.loads(raw) if raw else None
def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0]); h = math.sin((p2-p1)/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(math.radians(b[1]-a[1])/2)**2
    return 12742 * math.asin(math.sqrt(h))
def target_for(frame):
    t = frame["target"]; key = t.get("ip") or t.get("hostname") or ""
    if key.startswith("1.1.1.") or key.startswith("8.8.8."): return None  # anycast
    i = int(hashlib.sha1(key.encode()).hexdigest(), 16) % len(TARGETS); return TARGETS[i]
def rtt_ms(pos, tgt, rnd):
    if tgt is None: return 1.2 + rnd.uniform(0, 3.5)
    return 8 + 1.7 * km(pos, (tgt[1], tgt[2])) / 100 + rnd.uniform(0, 4)
def public_ip(rnd): return f"{rnd.choice([4, 62, 80, 129, 154, 195, 212])}.{rnd.randint(1,250)}.{rnd.randint(1,250)}.{rnd.randint(1,250)}"
# A certificate's dates are fixed, whoever asks and whenever: the start of a day, so nodes asking seconds apart agree.
cert_day = lambda d=0: (datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0) + datetime.timedelta(days=d)).strftime("%Y-%m-%dT%H:%M:%SZ")
now = lambda d=0: (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=d)).strftime("%Y-%m-%dT%H:%M:%SZ")

async def run_task(ws, pos, f, rnd):
    ids = {"task_id": f["task_id"], "attempt_id": f["attempt_id"]}
    send = lambda o: ws.send(json.dumps(o))
    await send({"type": "task_ack", **ids})
    tgt = target_for(f); kind = f["kind"]; o = f["options"]; ip = f["target"].get("ip") or "93.184.216.34"
    if (f["target"].get("hostname") or "") == GEO_NAME:
        # geo-DNS: the nodes east of 60 degrees resolve this name to a server in Singapore, the others to one in Frankfurt
        east = pos[1] > 60
        tgt, ip = (("Singapore", 1.35, 103.82), "151.101.1.77") if east else (("Frankfurt", 50.11, 8.68), "104.18.1.10")
    if kind in ("ping", "tcp"):
        port = f["target"].get("port")
        for seq in range(o["count"]):
            await asyncio.sleep(0.45)
            r = rtt_ms(pos, tgt, rnd) + (rnd.uniform(0, 6) if rnd.random() < 0.2 else 0)
            if rnd.random() < 0.04: await send({"type": "sample", **ids, "seq": seq, "status": "timeout"}); continue
            if kind == "tcp" and port == 25: await send({"type": "sample", **ids, "seq": seq, "status": "error", "rtt_us": int(r*1000), "error_code": "connection_refused"}); continue
            await send({"type": "sample", **ids, "seq": seq, "status": "ok", "rtt_us": int(r * 1000)})
    elif kind == "dns":
        await asyncio.sleep(rnd.uniform(0.2, 0.9))
        name = f["target"]["hostname"]; qtype = o["record_type"]; res = o.get("resolver_ip") or "system"
        # a name that starts with "nx-" does not exist; one that starts with "split-" is mid-change: the
        # nodes in Asia still hold the old record, one in Europe is stale too, a node in Africa times out
        region = {"Tokyo": 1, "Singapore": 1, "Mumbai": 1, "Sydney": 1, "Dubai": 1, "Madrid": 2}.get(NAME[id(rnd)], 0)
        if name.startswith("split-") and NAME[id(rnd)] == "Johannesburg" and res == "system":
            await send({"type": "sample", **ids, "seq": 0, "status": "timeout"}); await send({"type": "task_result", **ids, "status": "completed"}); return
        recs = []
        base = int(hashlib.sha1(name.encode()).hexdigest()[:6], 16)
        if name.startswith("nx-"): rcode = "NXDOMAIN"
        else:
            rcode = "NOERROR"; stale = name.startswith("split-") and region > 0 and (res == "system" or region == 2)
            ttl = rnd.choice([30, 60, 300, 3600]) if res == "system" else 300
            if qtype == "A": recs = [{"name": name, "type": "A", "ttl": ttl, "data": f"93.184.{216 + (1 if stale else 0)}.{34 + (base % 5)}"}]
            elif qtype == "AAAA": recs = [{"name": name, "type": "AAAA", "ttl": ttl, "data": "2606:2800:220:1:248:1893:25c8:1946"}]
            elif qtype == "MX": recs = [{"name": name, "type": "MX", "ttl": 3600, "data": "10 mail." + name}, {"name": name, "type": "MX", "ttl": 3600, "data": "20 backup." + name}]
            elif qtype == "TXT": recs = [{"name": name, "type": "TXT", "ttl": 300, "data": "v=spf1 include:_spf.example.net -all"}]
            elif qtype == "NS": recs = [{"name": name, "type": "NS", "ttl": 86400, "data": "ns1.example.net"}, {"name": name, "type": "NS", "ttl": 86400, "data": "ns2.example.net"}]
            elif qtype == "CNAME": recs = [{"name": "www." + name, "type": "CNAME", "ttl": ttl, "data": "edge." + name}]
            else: recs = [{"name": name, "type": "SOA", "ttl": 300, "data": "ns1.example.net hostmaster.example.net 2026110701 7200 900 1209600 300"}]
            if name == GEO_NAME and qtype == "A" and res == "system":
                # geo-DNS: the same two servers as the ping above (so one node resolving it gets the server near it)
                recs = [{"name": name, "type": "A", "ttl": 60, "data": "151.101.1.77" if pos[1] > 60 else "104.18.1.10"}]
            elif res == "system" and rnd.random() < 0.15: recs.append({"name": name, "type": "A", "ttl": 60, "data": "10.1.2.3"}) if qtype == "A" else None
        r = rnd.uniform(4, 40) if res == "system" else rnd.uniform(12, 90)
        redacted = 0
        if res == "system":
            kept = [x for x in recs if x["data"] != "10.1.2.3"]; redacted = len(recs) - len(kept); recs = kept
        detail = {"resolver": "system" if res == "system" else res, "record_type": qtype, "rcode": rcode, "authoritative": False, "via_tcp": False, "truncated": False, "answers": recs, "redacted": redacted}
        if o.get("transport") == "doh": detail["transport"] = "doh"  # HTTPS takes a few round trips more than a UDP packet
        await send({"type": "sample", **ids, "seq": 0, "status": "ok", "rtt_us": int(r * (3 if o.get("transport") == "doh" else 1) * 1000), "detail": detail})
        await send({"type": "task_result", **ids, "status": "completed", "resolved_ips": [x["data"] for x in recs if x["type"] == "A"]})
        return
    elif kind == "tls":
        # Ports the simulation treats specially (the backend resolves the name itself, so a made-up name cannot
        # carry the behaviour): 465 has a certificate with 9 days left, 8443 an expired one that is not trusted,
        # 993 shows nodes east of 60 degrees E an older certificate (9 days left) than everyone else.
        host = f["target"].get("server_name") or f["target"].get("hostname") or ip
        await asyncio.sleep(rnd.uniform(0.2, 0.9))
        connect = int(rtt_ms(pos, tgt, rnd) * 1000 * 1.1); shake = int(connect * rnd.uniform(1.6, 2.4)); total = connect + shake
        days, verified, err = 60, True, None
        port = f["target"].get("port")
        if port == 465: days = 9
        if port == 8443: days, verified, err = -3, False, "the certificate has expired"
        if port == 993 and pos[1] > 60: days = 9
        info = {"version": "TLSv1.3", "cipher": "TLS13_AES_256_GCM_SHA384", "subject": f"CN={host}", "issuer": "C=US, O=Let's Encrypt, CN=R11",
                "not_before": cert_day(days - 90), "not_after": cert_day(days), "verified": verified}
        if err: info["verify_error"] = err
        detail = {"server_name": host, "connect_us": connect, "tls_us": shake, "total_us": total, "tls": info, "names": [host, f"www.{host}"], "chain": 2}
        if o.get("transport") == "quic": detail.update(transport="quic", alpn="h3"); info.pop("cipher", None)
        if rnd.random() < 0.03: await send({"type": "sample", **ids, "seq": 0, "status": "timeout"})
        elif verified: await send({"type": "sample", **ids, "seq": 0, "status": "ok", "rtt_us": total, "detail": detail})
        else: await send({"type": "sample", **ids, "seq": 0, "status": "error", "error_code": "tls_certificate_invalid", "detail": detail})
    elif kind == "http":
        await asyncio.sleep(0.8)
        r = rtt_ms(pos, tgt, rnd); dns = int(rnd.uniform(2, 30) * 1000) if "hostname" in f["target"] else 0
        connect = int(r * 1000); tls = int(r * 2.1 * 1000); ttfb = int((r + rnd.uniform(15, 90)) * 1000); total = dns + connect + tls + ttfb
        host = f["target"].get("server_name") or f["target"].get("hostname") or ip
        detail = {"status_code": rnd.choice([200, 200, 200, 301]), "http_version": "HTTP/1.1", "server": "nginx", "content_type": "text/html; charset=utf-8",
                  "dns_us": dns, "connect_us": connect, "tls_us": tls, "ttfb_us": ttfb, "total_us": total, "final_scheme": o.get("scheme", "https"), "final_host": host, "final_path": o.get("path", "/"),
                  "tls": {"version": "TLSv1.3", "cipher": "TLS13_AES_256_GCM_SHA384", "subject": f"CN={host}", "issuer": "C=US, O=Let's Encrypt, CN=R11", "not_before": now(-40), "not_after": now(rnd.choice([6, 49, 71])), "verified": True}, "redirects": []}
        await send({"type": "sample", **ids, "seq": 0, "status": "ok", "rtt_us": total, "detail": detail})
    else:
        total_r = rtt_ms(pos, tgt, rnd); hops = 5 + int((km(pos, (tgt[1], tgt[2])) if tgt else 300) / 1800) + rnd.randint(0, 2)
        rounds = o.get("count", 1)
        sent = 3 + (rounds - 1)
        # In a repeated trace one router rate-limits the replies to probes aimed at itself (loss that stops there),
        # and now and then a link drops packets for good (loss that carries on to the destination).
        limited = rnd.randint(2, max(2, hops - 1)) if rounds > 1 else None
        lossy_from = hops - 1 if rounds > 1 and rnd.random() < 0.3 else None
        quiet = {ttl for ttl in range(3, hops) if rnd.random() < 0.14}
        ips = {ttl: (ip if ttl == hops else public_ip(rnd)) for ttl in range(2, hops + 1)}
        pending = []
        for ttl in range(1, hops + 1):
            if rounds == 1: await asyncio.sleep(0.22)
            frac = ttl / hops; last = ttl == hops
            chance = 0.5 if ttl == limited else 0.35 if lossy_from is not None and ttl >= lossy_from else 0.02 if rounds > 1 else 0
            rt = [max(0.05, total_r * frac * rnd.uniform(0.85, 1.05) if ttl > 1 else rnd.uniform(0.1, 0.9)) for _ in range(sent)]
            rt = [x for x in rt if rnd.random() >= chance]
            if ttl in quiet and not last: rt = []
            if last and not rt: rt = [total_r]
            d = {"ttl": ttl, "private": ttl == 1, "rtts_us": sorted(int(x * 1000) for x in rt), "reached": last}
            if rounds > 1: d["sent"] = sent
            if ttl > 1 and rt: d["ip"] = ips[ttl]
            sample = {"type": "sample", **ids, "seq": ttl - 1, "status": "ok" if rt else "timeout", "detail": d}
            if rt: sample["rtt_us"] = min(d["rtts_us"])
            if rounds == 1: await send(sample)
            else: pending.append(sample)
        if pending:
            await asyncio.sleep(0.4 * (rounds - 1) + 0.5)  # a repeated trace reports once its last round is done
            for sample in pending: await send(sample)
    await send({"type": "task_result", **ids, "status": "completed", "tested_ip": ip})

NAME = {}
async def run_node(name, cc, lat, lon, credential):
    rnd = random.Random(name); NAME[id(rnd)] = name
    async with connect(WS, additional_headers={"Authorization": f"Bearer {credential}"}) as ws:
        async def beat():
            while True:
                await asyncio.sleep(8); await ws.send(json.dumps({"type": "ping"}))
        asyncio.create_task(beat())
        await ws.send(json.dumps({"type": "hello", "protocol_versions": [1], "node_version": "0.7.0", "capabilities": {"kinds": ["ping", "tcp", "http", "traceroute", "dns", "tls"], "ipv4": True, "ipv6": True}}))
        async for raw in ws:
            f = json.loads(raw)
            if f["type"] == "task": asyncio.create_task(run_task(ws, (lat, lon), f, rnd))

async def keep(name, cc, lat, lon, credential):
    # one node losing its credential (a rotated key in a test) must not take the others down
    while True:
        try:
            await run_node(name, cc, lat, lon, credential)
        except Exception as err:
            code = getattr(getattr(err, "rcvd", None), "code", None)
            if code == 4403:
                print(name, "credential rotated; leaving it offline", flush=True); return
            await asyncio.sleep(3)

async def main():
    global csrf
    csrf = call("GET", "/api/v1/session")["csrf_token"]
    try: csrf = call("POST", "/api/v1/setup", {"setup_token": "e2e-token", "username": "admin", "password": "correct horse battery"})["csrf_token"]
    except urllib.error.HTTPError: csrf = call("POST", "/api/v1/admin/login", {"username": "admin", "password": "correct horse battery"})["csrf_token"]
    existing = {n["name"]: n for n in call("GET", "/api/v1/admin/nodes")}
    creds = json.load(open(CREDS)) if os.path.exists(CREDS) else {}
    for i, (name, cc, lat, lon, prov) in enumerate(NODES):
        if name in existing or name in creds: continue
        tok = call("POST", "/api/v1/admin/enrollment-tokens", {"label": name, "tier": "community" if name in COMMUNITY else "official"})["token"]
        r = None
        body = {"token": tok, "name": name, "version": "0.3.3", "country": cc, "city": name, "latitude": lat, "longitude": lon, "provider": prov}
        r = urllib.request.Request(B + "/api/v1/nodes/enroll", method="POST", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        while True:
            try:
                with urllib.request.urlopen(r) as x: e = json.loads(x.read())
                break
            except urllib.error.HTTPError as err:
                if err.code != 429: raise
                print("rate limited, waiting a minute", flush=True); await asyncio.sleep(62)
        call("POST", f"/api/v1/admin/nodes/{e['node_id']}/approve")
        if i % 3 != 2 and name not in COMMUNITY: call("PATCH", f"/api/v1/admin/nodes/{e['node_id']}", {"location_verified": True})
        creds[name] = e["credential"]
    json.dump(creds, open(CREDS, "w"))
    print("fleet ready:", len(creds), "nodes", flush=True)
    await asyncio.gather(*(keep(n, cc, lat, lon, creds[n]) for n, cc, lat, lon, _ in NODES if n in creds))
asyncio.run(main())
