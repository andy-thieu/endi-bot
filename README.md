# Discord Team Generator Bot

Ein Discord Bot der mit `/custom` zufällige Teams aus Voice Channel Mitgliedern erstellt.

## Features

- 🎮 `/custom` Command zum Erstellen von 2 zufälligen Teams
- 🎤 Liest automatisch alle User aus deinem Voice Channel
- ➕ Option zum Hinzufügen von zusätzlichen Spielern (die nicht im Voice sind)
- 🔀 Fisher-Yates Shuffle für faire Randomisierung

## Setup

### 1. Discord Bot erstellen

1. Gehe zum [Discord Developer Portal](https://discord.com/developers/applications)
2. Klicke auf "New Application" und gib einen Namen ein
3. Gehe zu "Bot" → "Add Bot"
4. Kopiere den **Bot Token**
5. Gehe zu "OAuth2" → kopiere die **Client ID**

### 2. Bot Berechtigungen

Unter "OAuth2" → "URL Generator":

- Scopes: `bot`, `applications.commands`
- Bot Permissions: `Send Messages`, `Use Slash Commands`

Nutze die generierte URL um den Bot auf deinen Server einzuladen.

### 3. Umgebungsvariablen

Erstelle eine `.env` Datei (oder kopiere `.env.example`):

```bash
DISCORD_TOKEN=dein_bot_token_hier
DISCORD_CLIENT_ID=deine_client_id_hier
```

### 4. Dependencies installieren

```bash
bun install
```

### 5. Bot starten

```bash
bun run index.ts
```

## Verwendung

1. Gehe in einen Voice Channel
2. Tippe `/custom` in einen Text Channel
3. Ein Modal erscheint - hier kannst du optional zusätzliche Spieler hinzufügen (kommagetrennt)
4. Die Teams werden zufällig erstellt und angezeigt

## Beispiel Output

```
🎮 Teams wurden erstellt!

🔵 Team 1 (3 Spieler):
• Max
• Lisa
• Tom

🔴 Team 2 (2 Spieler):
• Anna
• Felix

📊 Gesamt: 5 Spieler
➕ Hinzugefügt: Felix
```
