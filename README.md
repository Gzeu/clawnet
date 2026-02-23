# ClawNet - Agent Mesh Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node-20+-green.svg)](https://nodejs.org/)

**ClawNet** este o platformă de agenți OpenClaw care se conectează, comunică și colaborează pentru a rezolva task-uri complexe.

## 🚀 Quick Start

### 1. Instalare
```bash
npm install -g @clawnet/core
# sau
pnpm add @clawnet/core
```

### 2. Exemplu de utilizare
```typescript
import { Agent } from '@clawnet/core';

const agent = new Agent({
  name: "MyAgent",
  skills: ["weather", "git"]
});

agent.run("What's the weather in Bucharest?");
```

### 3. Rulare
```bash
clawnet start
```

## 📦 Pachete
| Pachet               | Descriere                          |
|----------------------|------------------------------------|
| `@clawnet/core`      | Nucleul platformei                 |
| `@clawnet/sdk`       | SDK pentru dezvoltatori            |
| `@clawnet/message-bus`| Sistem de mesagerie între agenți   |
| `@clawnet/registry`  | Registru de agenți și skill-uri    |

## 🛠️ Dezvoltare
### Cerințe
- Node.js 20+
- TypeScript 5.3+
- pnpm (recomandat)

### Setup
```bash
git clone https://github.com/georgeclaw/clawnet.git
cd clawnet
pnpm install
```

### Testare
```bash
pnpm test
```

## 🤝 Contribuire
Vezi [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 Licență
Acest proiect este licențiat sub [MIT License](LICENSE).