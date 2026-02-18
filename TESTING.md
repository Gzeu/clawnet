# ClawNet - Testare Rapidă

## 🧪 Testare Locală

### Opțiunea 1: Mock Server (fără Docker)

```bash
# Terminal 1: Pornește mock server
cd E:\github\clawnet
node mock-server.js

# Terminal 2: Rulează testele
node test-integration.js
```

### Opțiunea 2: Docker Compose

```bash
cd E:\github\clawnet
docker-compose up -d
node test-integration.js
```

---

## 🦞 Test din OpenClaw

Odată ce ClawNet rulează, poți testa direct din această sesiune:

### 1. Health Check

```bash
curl http://localhost:4000/health
```

### 2. Înregistrează OpenClaw ca agent

```bash
curl -X POST http://localhost:4000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"id":"openclaw-main","name":"OpenClaw Main","capabilities":{"skills":["coding","research","analysis"],"tools":["read","write","exec","browser"],"domains":["software","ai"],"maxContextTokens":200000}}'
```

### 3. Scrie în memoria partajată

```bash
curl -X POST http://localhost:4000/api/v1/memory/write \
  -H "Content-Type: application/json" \
  -d '{"key":"test-session","value":{"status":"testing","time":"now"},"createdBy":{"id":"openclaw-main"},"tags":["test"]}'
```

### 4. Caută în memorie

```bash
curl -X POST http://localhost:4000/api/v1/memory/search \
  -H "Content-Type: application/json" \
  -d '{"tags":["test"]}'
```

### 5. Verifică statistici

```bash
curl http://localhost:4000/api/v1/stats
```

---

## 📊 Ce S-a Creat

| Fișier | Descriere |
|--------|-----------|
| `mock-server.js` | Server mock pentru testare rapidă |
| `test-integration.js` | Teste automate pentru API |
| `test.bat` / `test.sh` | Scripturi de testare |
| `SKILL.md` | Skill OpenClaw pentru ClawNet |

---

## 🦞 Skill Creat

Skill-ul `clawnet` este instalat la:
```
C:\Users\el\.openclaw\workspace\skills\clawnet\SKILL.md
```

OpenClaw îl va detecta automat și va putea folosi ClawNet pentru:
- Context handoff
- Task delegation
- Shared memory
- Agent discovery