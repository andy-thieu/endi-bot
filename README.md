# Discord Team Generator Bot

A Discord bot that creates random teams from voice channel members using the `/custom` command.

## Features

- 🎮 `/custom` command to create 2 random teams
- 🎤 Automatically reads all users from your voice channel
- ➕ Option to add additional players (who aren't in voice)
- 🔀 Fisher-Yates shuffle for fair randomization

## Tech Stack

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** TypeScript
- **Library:** [discord.js](https://discord.js.org/)

## How It Works

1. Join a voice channel
2. Use the `/custom` slash command
3. Optionally add extra players via the modal
4. Teams are randomly generated and displayed with interactive buttons to reshuffle

## Example Output

```
**Custom Teams**
**Team 1**
> @Max
> @Lisa
> @Tom
**Team 2**
> @Anna
> @Felix
5 players
```
