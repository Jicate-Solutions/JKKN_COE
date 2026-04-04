# Cloudflare WAF Rules for JKKN COE

Configure these rules in Cloudflare Dashboard > Security > WAF > Custom Rules.
These complement the application-level security implemented in middleware.

## Rule 1: Block Known Bad Bots

```
Name: Block malicious bots
Expression: (cf.client.bot) and not (cf.bot_management.verified_bot)
Action: Block
```

## Rule 2: Rate Limit Login Endpoint

```
Name: Rate limit authentication
Expression: (http.request.uri.path contains "/api/auth" or http.request.uri.path contains "/api/token") and http.request.method eq "POST"
Action: Rate Limit → 10 requests per 1 minute per IP
Response: 429
```

## Rule 3: Block SQL Injection Patterns

```
Name: Block SQLi in query params
Expression: (http.request.uri.query contains "UNION" and http.request.uri.query contains "SELECT") or (http.request.uri.query contains "DROP" and http.request.uri.query contains "TABLE") or (http.request.uri.query contains "1=1") or (http.request.uri.query contains "OR 1")
Action: Block
```

## Rule 4: Block XSS in URL

```
Name: Block XSS attempts in URL
Expression: http.request.uri contains "<script" or http.request.uri contains "javascript:" or http.request.uri contains "onerror=" or http.request.uri contains "onload="
Action: Block
```

## Rule 5: Restrict Admin API by Country (Optional)

```
Name: Geo-restrict admin API
Expression: (http.request.uri.path contains "/api/admin") and not (ip.geoip.country eq "IN")
Action: Block
```

## Rule 6: Block Excessive Error Rates

```
Name: Block clients generating too many 4xx errors
Expression: (http.request.uri.path contains "/api")
Action: Rate Limit → 50 requests returning 4xx per 1 minute per IP
Response: 403 (Challenge)
```

## Rule 7: Protect API v1 External Endpoints

```
Name: Rate limit external API
Expression: (http.request.uri.path contains "/api/v1")
Action: Rate Limit → 120 requests per 1 minute per IP
Response: 429
```

## Rule 8: Block Path Traversal

```
Name: Block path traversal attempts
Expression: http.request.uri contains "../" or http.request.uri contains "..%2f" or http.request.uri contains "%2e%2e" or http.request.uri contains "..%5c"
Action: Block
```

## Managed Rules (Enable These)

1. **Cloudflare Managed Ruleset** → Enable
2. **OWASP Core Ruleset** → Enable with Paranoia Level 1
3. **Cloudflare Leaked Credentials Detection** → Enable
4. **Exposed Credentials Check** → Enable

## Bot Management

1. **Bot Fight Mode** → Enable
2. **Super Bot Fight Mode** → Enable (Pro plan)
3. **Verified bots** → Allow (Google, Bing, etc.)

## SSL/TLS Settings

1. **SSL Mode** → Full (Strict)
2. **Always Use HTTPS** → Enable
3. **Minimum TLS Version** → TLS 1.2
4. **HSTS** → Enable (max-age=31536000, include subdomains)

## Page Rules

```
URL: *jkkn.ai/api/*
Setting: Cache Level → Bypass (never cache API responses)

URL: *jkkn.ai/login*
Setting: Security Level → High
```
