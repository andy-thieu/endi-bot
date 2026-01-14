import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  MessageFlags,
} from "discord.js";

import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Discord Bot aktiv!");
});

export default app;

// Bot Token und Client ID hier eintragen
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Slash Commands registrieren
const commands = [
  new SlashCommandBuilder()
    .setName("custom")
    .setDescription("Erstellt 2 zufällige Teams aus Voice Channel Mitgliedern")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("arena")
    .setDescription(
      "Teilt alle Voice Channel Mitglieder in zufällige 2er Teams ein",
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName("delete")
    .setDescription("Löscht alle Bot-Nachrichten in diesem Channel")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("testcustom")
    .setDescription(
      "Testet die Random Team Funktion mit Mock-Spielern (T1 + G2)",
    )
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(TOKEN!);

async function registerCommands() {
  try {
    console.log("Registriere Slash Commands (GLOBAL)...");

    // WICHTIG: Wir nutzen hier Routes.applicationCommands (ohne Guild ID)
    // Das sorgt dafür, dass die Buttons im Profil erscheinen.
    await rest.put(Routes.applicationCommands(CLIENT_ID!), {
      body: commands,
    });

    console.log("Slash Commands erfolgreich GLOBAL registriert!");
    console.log(
      "HINWEIS: Es kann bis zu 1 Stunde dauern, bis die Buttons im Profil sichtbar sind (Discord Cache).",
    );
  } catch (error) {
    console.error("Fehler beim Registrieren der Commands:", error);
  }
}

// Hilfsfunktion: Array mischen (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = temp;
  }
  return shuffled;
}

// Hilfsfunktion: Teams erstellen
function createTeams(players: Player[]): { team1: Player[]; team2: Player[] } {
  const shuffled = shuffleArray(players);
  const mid = Math.ceil(shuffled.length / 2);
  return {
    team1: shuffled.slice(0, mid),
    team2: shuffled.slice(mid),
  };
}

// Spieler-Typ: entweder Discord User (mit ID) oder manuell eingegebener Name
type Player = { oderId: string; displayName: string } | { name: string };

// Temporärer Speicher für Voice Channel User pro Interaktion
const pendingTeams = new Map<string, Player[]>();

// Speicher für aktive Team-Sessions (Message ID -> Spielerliste)
const activeTeamSessions = new Map<string, Player[]>();

// Speicher für Message Updates (User ID -> Message ID)
const pendingMessageUpdates = new Map<string, string>();

// Speicher für Voice Channel User (User ID -> {displayName, userId}[])
const pendingVoiceUsers = new Map<
  string,
  { displayName: string; userId: string }[]
>();

// Speicher für ausgeschlossene User (User ID -> Set<userId>)
const excludedUsers = new Map<string, Set<string>>();

// Speicher für den letzten Shuffler pro Nachricht (Message ID -> User ID)
const lastShuffledBy = new Map<string, string>();

// Speicher für den letzten Rollen-Shuffler pro Nachricht (Message ID -> User ID)
const lastRolesShuffledBy = new Map<string, string>();

// League of Legends Rollen
const LOL_ROLES = ["Top", "Jungle", "Mid", "ADC", "Support"];

// Mock-Spieler für Test (T1 + G2)
const MOCK_PLAYERS: Player[] = [
  { name: "Doran" },
  { name: "Oner" },
  { name: "Faker" },
  { name: "Gumayusi" },
  { name: "Keria" },
  { name: "Caps" },
  { name: "Hans Sama" },
  { name: "Jankos" },
  { name: "Broken Blade" },
  { name: "Endi" },
];

// Speicher für Team-Rollen (Message ID -> { team1: PlayerWithRole[], team2: PlayerWithRole[] })
type PlayerWithRole = { player: Player; role?: string };
const teamRoles = new Map<
  string,
  { team1: PlayerWithRole[]; team2: PlayerWithRole[] }
>();

client.on("clientReady", () => {
  console.log(`Bot ist online als ${client.user?.tag}!`);
  registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  // Slash Command Handler
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "custom") {
      await handleCustomCommand(interaction);
    }
    if (interaction.commandName === "arena") {
      await handleArenaCommand(interaction);
    }
    if (interaction.commandName === "delete") {
      await handleDeleteCommand(interaction);
    }
    if (interaction.commandName === "testcustom") {
      await handleTestCustomCommand(interaction);
    }
  }

  // Modal Submit Handler
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "add_players_modal") {
      await handleModalSubmit(interaction);
    }
    if (interaction.customId === "add_players_modal_update") {
      await handleModalSubmitUpdate(interaction);
    }
  }

  // Button Handler
  if (interaction.isButton()) {
    if (interaction.customId === "reroll_teams") {
      await handleRerollButton(interaction);
    }
    if (interaction.customId === "new_names") {
      await handleNewNamesButton(interaction);
    }
    if (interaction.customId === "confirm_players") {
      await handleConfirmPlayersButton(interaction);
    }
    if (interaction.customId === "reroll_arena") {
      await handleRerollArenaButton(interaction);
    }
    if (interaction.customId === "reroll_test_teams") {
      await handleRerollTestTeamsButton(interaction);
    }
    if (interaction.customId === "assign_roles") {
      await handleAssignRolesButton(interaction);
    }
  }

  // Select Menu Handler
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "exclude_players") {
      await handleExcludePlayersSelect(interaction);
    }
  }
});

async function handleCustomCommand(interaction: ChatInputCommandInteraction) {
  const member = interaction.member;
  const guild = interaction.guild;

  if (!guild || !member) {
    await interaction.reply({
      content: "❌ Dieser Command funktioniert nur auf einem Server!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Voice Channel des Users finden
  const guildMember = await guild.members.fetch(interaction.user.id);
  const voiceChannel = guildMember.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content:
        "❌ Du musst in einem Voice Channel sein, um diesen Command zu nutzen!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Alle User aus dem Voice Channel holen (mit ID und DisplayName)
  const voiceUsers = voiceChannel.members.map((m) => ({
    displayName: m.displayName,
    userId: m.id,
  }));

  if (voiceUsers.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler im Voice Channel sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Speichere die Voice Channel User für später
  pendingVoiceUsers.set(interaction.user.id, voiceUsers);
  excludedUsers.set(interaction.user.id, new Set());

  // Select Menu für Spieler-Ausschluss anzeigen
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("exclude_players")
    .setPlaceholder("Wähle Spieler aus, die NICHT mitspielen")
    .setMinValues(0)
    .setMaxValues(voiceUsers.length)
    .addOptions(
      voiceUsers.map((user) => ({
        label: user.displayName,
        value: user.userId,
        description: "Klicke um auszuschließen",
      })),
    );

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm_players")
    .setLabel("Weiter")
    .setStyle(ButtonStyle.Primary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
  );

  await interaction.reply({
    content: `**Voice Channel Spieler (${voiceUsers.length}):**\n${voiceUsers.map((u) => `• ${u.displayName}`).join("\n")}\n\n📋 Wähle unten die Spieler aus, die **nicht** mitspielen sollen:`,
    components: [selectRow, buttonRow],
    flags: MessageFlags.Ephemeral,
  });
}

// Handler für Select Menu (Spieler ausschließen)
async function handleExcludePlayersSelect(
  interaction: StringSelectMenuInteraction,
) {
  const selectedUserIds = interaction.values;
  excludedUsers.set(interaction.user.id, new Set(selectedUserIds));

  const voiceUsers = pendingVoiceUsers.get(interaction.user.id);
  if (!voiceUsers) {
    await interaction.reply({
      content: "❌ Fehler: Keine Daten gefunden. Bitte nutze /custom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Aktualisierte Anzeige mit markierten ausgeschlossenen Spielern
  const playerList = voiceUsers
    .map((u) => {
      const isExcluded = selectedUserIds.includes(u.userId);
      return isExcluded ? `~~${u.displayName}~~ ❌` : `• ${u.displayName}`;
    })
    .join("\n");

  const activeCount = voiceUsers.length - selectedUserIds.length;

  // Select Menu neu erstellen mit aktuellen Werten
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("exclude_players")
    .setPlaceholder("Wähle Spieler aus, die NICHT mitspielen")
    .setMinValues(0)
    .setMaxValues(voiceUsers.length)
    .addOptions(
      voiceUsers.map((user) => ({
        label: user.displayName,
        value: user.userId,
        description: selectedUserIds.includes(user.userId)
          ? "Ausgeschlossen"
          : "Klicke um auszuschließen",
        default: selectedUserIds.includes(user.userId),
      })),
    );

  const selectRow =
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm_players")
    .setLabel("Weiter")
    .setStyle(ButtonStyle.Primary);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    confirmButton,
  );

  await interaction.update({
    content: `**Voice Channel Spieler:**\n${playerList}\n\n📋 **${activeCount} Spieler** werden berücksichtigt.\nWähle unten die Spieler aus, die **nicht** mitspielen sollen:`,
    components: [selectRow, buttonRow],
  });
}

// Handler für Confirm Button (zeigt Modal für zusätzliche Spieler)
async function handleConfirmPlayersButton(interaction: ButtonInteraction) {
  const voiceUsers = pendingVoiceUsers.get(interaction.user.id);
  const excluded = excludedUsers.get(interaction.user.id) || new Set();

  if (!voiceUsers) {
    await interaction.reply({
      content: "❌ Fehler: Keine Daten gefunden. Bitte nutze /custom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Filtere ausgeschlossene Spieler (behalte User-ID für Mentions)
  const activePlayers: Player[] = voiceUsers
    .filter((u) => !excluded.has(u.userId))
    .map((u) => ({ oderId: u.userId, displayName: u.displayName }));

  if (activePlayers.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler übrig bleiben!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Speichere die aktiven Spieler für das Modal
  pendingTeams.set(interaction.user.id, activePlayers);

  // Modal für zusätzliche Spieler anzeigen
  const modal = new ModalBuilder()
    .setCustomId("add_players_modal")
    .setTitle("Zusätzliche Spieler hinzufügen");

  const additionalPlayersInput = new TextInputBuilder()
    .setCustomId("additional_players")
    .setLabel("Zusätzliche Spieler (kommagetrennt)")
    .setPlaceholder("z.B. Faker, Keria, Endidi")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    additionalPlayersInput,
  );

  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  // Aufräumen
  pendingVoiceUsers.delete(interaction.user.id);
  excludedUsers.delete(interaction.user.id);
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const voiceMembers = pendingTeams.get(interaction.user.id);

  if (!voiceMembers) {
    await interaction.reply({
      content:
        "❌ Fehler: Keine Voice Channel Daten gefunden. Bitte nutze /custom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Zusätzliche Spieler aus dem Modal holen (als manuelle Namen)
  const additionalPlayersRaw =
    interaction.fields.getTextInputValue("additional_players");
  const additionalPlayers: Player[] = additionalPlayersRaw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));

  // Alle Spieler kombinieren
  const allPlayers: Player[] = [...voiceMembers, ...additionalPlayers];

  if (allPlayers.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler vorhanden sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Teams erstellen und Nachricht senden
  const { content, buttons, team1, team2 } = createTeamMessage(allPlayers);

  const response = await interaction.reply({
    content,
    components: [buttons],
    withResponse: true,
  });

  // Spielerliste und Teams für Re-Roll/Rollen speichern
  const messageId = response.resource!.message!.id;
  activeTeamSessions.set(messageId, allPlayers);
  teamRoles.set(messageId, { team1, team2 });

  // Aufräumen
  pendingTeams.delete(interaction.user.id);
}

// Hilfsfunktion: Spieler in 2er Teams einteilen
function createPairs(players: Player[]): Player[][] {
  const shuffled = shuffleArray(players);
  const pairs: Player[][] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      pairs.push([shuffled[i]!, shuffled[i + 1]!]);
    } else {
      // Ungerade Anzahl: letzter Spieler allein
      pairs.push([shuffled[i]!]);
    }
  }
  return pairs;
}

// Arena Command Handler
async function handleArenaCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: "❌ Dieser Command funktioniert nur auf einem Server!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Voice Channel des Users finden
  const guildMember = await guild.members.fetch(interaction.user.id);
  const voiceChannel = guildMember.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Du musst in einem Voice Channel sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Alle User aus dem Voice Channel holen
  const players: Player[] = voiceChannel.members.map((m) => ({
    oderId: m.id,
    displayName: m.displayName,
  }));

  if (players.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler im Voice Channel sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // 2er Teams erstellen
  const pairs = createPairs(players);

  // Nachricht formatieren
  const teamsText = pairs
    .map((pair, index) => {
      const members = pair.map((p) => formatPlayer(p)).join(" & ");
      return `**Team ${index + 1}:** ${members}`;
    })
    .join("\n");

  const content = `🏟️ **Arena Teams:**\n\n${teamsText}\n\n📊 **${pairs.length} Teams** aus **${players.length} Spielern**`;

  // Reroll Button
  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("reroll_arena")
      .setLabel("Neu mischen")
      .setStyle(ButtonStyle.Primary),
  );

  const response = await interaction.reply({
    content,
    components: [buttons],
    withResponse: true,
  });

  // Spielerliste für Re-Roll speichern
  activeTeamSessions.set(response.resource!.message!.id, players);
}

// Button Handler für Arena Re-Roll
async function handleRerollArenaButton(interaction: ButtonInteraction) {
  const messageId = interaction.message.id;
  const players = activeTeamSessions.get(messageId);

  if (!players) {
    await interaction.reply({
      content: "❌ Diese Arena-Session ist abgelaufen. Nutze /arena erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Neue 2er Teams generieren
  const pairs = createPairs(players);

  const teamsText = pairs
    .map((pair, index) => {
      const members = pair.map((p) => formatPlayer(p)).join(" & ");
      return `**Team ${index + 1}:** ${members}`;
    })
    .join("\n");

  const content = `🏟️ **Arena Teams:**\n\n${teamsText}\n\n📊 **${pairs.length} Teams** aus **${players.length} Spielern**`;

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("reroll_arena")
      .setLabel("Neu mischen")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.update({ content, components: [buttons] });
}

// Hilfsfunktion: Spieler als String formatieren (Mention oder Name)
function formatPlayer(player: Player): string {
  if ("oderId" in player) {
    return `<@${player.oderId}>`;
  }
  return player.name;
}

// Hilfsfunktion: Team-Nachricht mit Buttons erstellen
function createTeamMessage(
  players: Player[],
  teamsShuffledByUserId?: string,
  rolesShuffledByUserId?: string,
  existingTeams?: { team1: PlayerWithRole[]; team2: PlayerWithRole[] },
): {
  content: string;
  buttons: ActionRowBuilder<ButtonBuilder>;
  team1: PlayerWithRole[];
  team2: PlayerWithRole[];
} {
  let team1: PlayerWithRole[];
  let team2: PlayerWithRole[];

  if (existingTeams) {
    team1 = existingTeams.team1;
    team2 = existingTeams.team2;
  } else {
    const teams = createTeams(players);
    team1 = teams.team1.map((p) => ({ player: p }));
    team2 = teams.team2.map((p) => ({ player: p }));
  }

  const hasRoles = team1.some((p) => p.role);

  const teamsShuffledText = teamsShuffledByUserId
    ? ` | Teams: <@${teamsShuffledByUserId}>`
    : "";

  const rolesShuffledText = rolesShuffledByUserId
    ? ` | Rollen: <@${rolesShuffledByUserId}>`
    : "";

  const formatTeam = (team: PlayerWithRole[], teamName: string): string => {
    const playerList = team.map((p) => {
      const playerName =
        "oderId" in p.player ? `<@${p.player.oderId}>` : p.player.name;
      if (hasRoles && p.role) {
        return `> \`${p.role.padEnd(7)}\` ${playerName}`;
      }
      return `> ${playerName}`;
    });
    return `**${teamName}**\n${playerList.join("\n")}`;
  };

  const content = `
**Custom Teams**
${formatTeam(team1, "Team 1")}
${formatTeam(team2, "Team 2")}
-# ${players.length} Spieler${teamsShuffledText}${rolesShuffledText}
  `.trim();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("reroll_teams")
      .setLabel("Neu mischen")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("assign_roles")
      .setLabel("Rollen zuweisen")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("new_names")
      .setLabel("Neue Namen")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content, buttons, team1, team2 };
}

// Button Handler für Re-Roll
async function handleRerollButton(interaction: ButtonInteraction) {
  const messageId = interaction.message.id;
  const players = activeTeamSessions.get(messageId);

  if (!players) {
    await interaction.reply({
      content: "❌ Diese Team-Session ist abgelaufen. Nutze /custom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Shuffler aktualisieren, Rollen zurücksetzen
  lastShuffledBy.set(messageId, interaction.user.id);
  lastRolesShuffledBy.delete(messageId);

  // Neue Teams generieren
  const { content, buttons, team1, team2 } = createTeamMessage(
    players,
    interaction.user.id,
  );

  // Teams speichern
  teamRoles.set(messageId, { team1, team2 });

  // Nachricht bearbeiten
  await interaction.update({ content, components: [buttons] });
}

// Modal Submit Handler für Update (bestehende Nachricht bearbeiten)
async function handleModalSubmitUpdate(interaction: ModalSubmitInteraction) {
  const voiceMembers = pendingTeams.get(interaction.user.id);
  const messageId = pendingMessageUpdates.get(interaction.user.id);

  if (!voiceMembers || !messageId) {
    await interaction.reply({
      content: "❌ Fehler: Keine Daten gefunden. Bitte nutze /custom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Zusätzliche Spieler aus dem Modal holen (als manuelle Namen)
  const additionalPlayersRaw =
    interaction.fields.getTextInputValue("additional_players");
  const additionalPlayers: Player[] = additionalPlayersRaw
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .map((name) => ({ name }));

  // Alle Spieler kombinieren
  const allPlayers: Player[] = [...voiceMembers, ...additionalPlayers];

  if (allPlayers.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler vorhanden sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Teams erstellen
  const { content, buttons, team1, team2 } = createTeamMessage(allPlayers);

  // Bestehende Nachricht bearbeiten
  const channel = interaction.channel;
  if (channel) {
    const message = await channel.messages.fetch(messageId);
    await message.edit({ content, components: [buttons] });
  }

  // Session und Teams aktualisieren
  activeTeamSessions.set(messageId, allPlayers);
  teamRoles.set(messageId, { team1, team2 });
  lastRolesShuffledBy.delete(messageId);

  // Aufräumen
  pendingTeams.delete(interaction.user.id);
  pendingMessageUpdates.delete(interaction.user.id);

  // Bestätigung senden (ephemeral)
  await interaction.reply({
    content: "✅ Teams wurden mit neuen Namen aktualisiert!",
    flags: MessageFlags.Ephemeral,
  });
}

// Button Handler für neue Namen
async function handleNewNamesButton(interaction: ButtonInteraction) {
  const guild = interaction.guild;

  if (!guild) {
    await interaction.reply({
      content: "❌ Dieser Button funktioniert nur auf einem Server!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Voice Channel des Users finden
  const guildMember = await guild.members.fetch(interaction.user.id);
  const voiceChannel = guildMember.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Du musst in einem Voice Channel sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Alle User aus dem Voice Channel holen (mit ID für Mentions)
  const voiceMembers: Player[] = voiceChannel.members.map((m) => ({
    oderId: m.id,
    displayName: m.displayName,
  }));

  if (voiceMembers.length < 2) {
    await interaction.reply({
      content: "❌ Es müssen mindestens 2 Spieler im Voice Channel sein!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Speichere die Voice Channel User und Message ID für später
  pendingTeams.set(interaction.user.id, voiceMembers);
  pendingMessageUpdates.set(interaction.user.id, interaction.message.id);

  // Modal für zusätzliche Spieler anzeigen
  const modal = new ModalBuilder()
    .setCustomId("add_players_modal_update")
    .setTitle("Zusätzliche Spieler hinzufügen");

  const additionalPlayersInput = new TextInputBuilder()
    .setCustomId("additional_players")
    .setLabel("Zusätzliche Spieler (kommagetrennt)")
    .setPlaceholder("z.B. Faker, Keria, Endidi")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);

  const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    additionalPlayersInput,
  );

  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

// Test Custom Command Handler (mit Mock-Spielern)
async function handleTestCustomCommand(
  interaction: ChatInputCommandInteraction,
) {
  // Teams erstellen
  const { content, buttons, team1, team2 } = createTeamMessage(MOCK_PLAYERS);

  const response = await interaction.reply({
    content,
    components: [buttons],
    withResponse: true,
  });

  // Session speichern
  const messageId = response.resource!.message!.id;
  activeTeamSessions.set(messageId, MOCK_PLAYERS);
  teamRoles.set(messageId, { team1, team2 });
}

// Button Handler für Test Teams Re-Roll
async function handleRerollTestTeamsButton(interaction: ButtonInteraction) {
  const messageId = interaction.message.id;
  const players = activeTeamSessions.get(messageId);

  if (!players) {
    await interaction.reply({
      content:
        "❌ Diese Team-Session ist abgelaufen. Nutze /testcustom erneut.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Rollen-Shuffler zurücksetzen wenn Teams neu gemischt werden
  lastRolesShuffledBy.delete(messageId);
  lastShuffledBy.set(messageId, interaction.user.id);

  // Neue Teams generieren
  const { content, buttons, team1, team2 } = createTeamMessage(
    players,
    interaction.user.id,
  );

  // Session aktualisieren
  teamRoles.set(messageId, { team1, team2 });

  await interaction.update({ content, components: [buttons] });
}

// Button Handler für Rollen-Zuweisung
async function handleAssignRolesButton(interaction: ButtonInteraction) {
  const messageId = interaction.message.id;
  const teams = teamRoles.get(messageId);
  const players = activeTeamSessions.get(messageId);

  if (!teams || !players) {
    await interaction.reply({
      content: "❌ Diese Team-Session ist abgelaufen.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Rollen zufällig zuweisen (5 Rollen für max 5 Spieler pro Team)
  const shuffledRoles1 = shuffleArray([...LOL_ROLES]);
  const shuffledRoles2 = shuffleArray([...LOL_ROLES]);

  const team1WithRoles: PlayerWithRole[] = teams.team1.map((p, i) => ({
    player: p.player,
    role: shuffledRoles1[i],
  }));

  const team2WithRoles: PlayerWithRole[] = teams.team2.map((p, i) => ({
    player: p.player,
    role: shuffledRoles2[i],
  }));

  // Rollen-Shuffler speichern
  lastRolesShuffledBy.set(messageId, interaction.user.id);

  const { content, buttons } = createTeamMessage(
    players,
    lastShuffledBy.get(messageId),
    interaction.user.id,
    { team1: team1WithRoles, team2: team2WithRoles },
  );

  // Session aktualisieren
  teamRoles.set(messageId, { team1: team1WithRoles, team2: team2WithRoles });

  await interaction.update({ content, components: [buttons] });
}

// Delete Command Handler
async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  const channel = interaction.channel;

  if (!channel || !("messages" in channel)) {
    await interaction.reply({
      content: "❌ Dieser Command funktioniert nur in Text-Channels!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Nachrichten im Channel abrufen (max 100)
    const messages = await channel.messages.fetch({ limit: 100 });

    // Nur Bot-Nachrichten filtern
    const botMessages = messages.filter(
      (msg) => msg.author.id === client.user?.id,
    );

    if (botMessages.size === 0) {
      await interaction.editReply({
        content: "ℹ️ Keine Bot-Nachrichten in diesem Channel gefunden.",
      });
      return;
    }

    // Nachrichten löschen
    let deletedCount = 0;
    for (const [, message] of botMessages) {
      try {
        await message.delete();
        deletedCount++;
      } catch {
        // Nachricht konnte nicht gelöscht werden (z.B. zu alt)
      }
    }

    await interaction.editReply({
      content: `✅ ${deletedCount} Bot-Nachricht(en) gelöscht.`,
    });

    // Aktive Sessions für gelöschte Nachrichten aufräumen
    for (const [, message] of botMessages) {
      activeTeamSessions.delete(message.id);
    }
  } catch (error) {
    console.error("Fehler beim Löschen:", error);
    await interaction.editReply({
      content: "❌ Fehler beim Löschen der Nachrichten.",
    });
  }
}

// Bot starten
client.login(TOKEN);

console.log("Discord Bot wird gestartet...");
